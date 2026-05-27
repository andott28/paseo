import type { AgentMode, AgentRecord, PermissionMode, PermissionRequestRecord, ScheduleRecord } from "@gaa/protocol";
import type { DatabaseService } from "./db.js";
import type { ProviderRegistry } from "./providers/registry.js";
import type { AgentProviderAdapter } from "./providers/types.js";
import type { WsHub } from "./ws-hub.js";

interface AgentManagerConfig {
  maxEventsPerAgent: number;
  targetEventsPerAgent: number;
  permissionRequestTimeoutMs: number;
}

interface ActiveRun {
  provider: AgentProviderAdapter;
  sessionId: string;
  abortController: AbortController;
}

interface AgentManagerHooks {
  onPermissionRequest(permission: PermissionRequestRecord): void;
  waitForPermissionDecision(permissionId: string, timeoutMs: number): Promise<"approved" | "denied" | "expired">;
}

export class AgentManager {
  private readonly db: DatabaseService;
  private readonly providers: ProviderRegistry;
  private readonly hub: WsHub;
  private readonly config: AgentManagerConfig;
  private readonly hooks: AgentManagerHooks;
  private readonly queues = new Map<string, Promise<void>>();
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(input: {
    db: DatabaseService;
    providers: ProviderRegistry;
    hub: WsHub;
    config: AgentManagerConfig;
    hooks: AgentManagerHooks;
  }) {
    this.db = input.db;
    this.providers = input.providers;
    this.hub = input.hub;
    this.config = input.config;
    this.hooks = input.hooks;
  }

  listAgents(): AgentRecord[] {
    return this.db.listAgents();
  }

  listAgentEvents(agentId: string, limit = 300) {
    return this.db.listEvents(agentId, limit);
  }

  listSubagents(agentId: string): AgentRecord[] {
    return this.db.listChildAgents(agentId);
  }

  async createAgent(input: {
    workspaceId?: string;
    parentAgentId?: string;
    provider: string;
    cwd: string;
    prompt?: string;
    title?: string;
    model?: string;
    mode?: AgentMode;
    permissionMode?: PermissionMode;
  }): Promise<AgentRecord> {
    const provider = this.providers.get(input.provider);
    const availability = await provider.isAvailable();
    if (!availability.available) {
      throw new Error(
        `Provider '${input.provider}' is unavailable: ${availability.reason ?? "Unknown reason"}`,
      );
    }
    const session = await provider.createSession({
      cwd: input.cwd,
      model: input.model,
      title: input.title,
    });

    const created = this.db.createAgent({
      workspaceId: input.workspaceId,
      parentAgentId: input.parentAgentId,
      provider: input.provider,
      cwd: input.cwd,
      title: input.title,
      model: input.model,
      sessionId: session.sessionId,
      mode: input.mode ?? "chat",
      permissionMode: input.permissionMode ?? "allow",
    });
    const initialized = this.db.setAgentStatus(created.id, "idle", null);
    this.hub.broadcastAgentUpdate(initialized);

    if (input.prompt && input.prompt.trim().length > 0) {
      await this.sendPrompt({
        agentId: initialized.id,
        prompt: input.prompt,
      });
    }
    return this.db.getAgentOrThrow(initialized.id);
  }

  setAgentModes(agentId: string, input: { mode?: AgentMode; permissionMode?: PermissionMode }): AgentRecord {
    const updated = this.db.setAgentModes(agentId, input);
    this.hub.broadcastAgentUpdate(updated);
    return updated;
  }

  async runSchedule(schedule: ScheduleRecord): Promise<void> {
    if (schedule.agentId) {
      await this.sendPrompt({ agentId: schedule.agentId, prompt: schedule.prompt });
      return;
    }
    await this.createAgent({
      workspaceId: schedule.workspaceId ?? undefined,
      provider: schedule.provider,
      cwd: schedule.cwd,
      prompt: schedule.prompt,
      title: `Schedule ${schedule.id.slice(0, 8)}`,
      mode: "auto",
      permissionMode: "allow",
    });
  }

  async sendPrompt(input: { agentId: string; prompt: string }): Promise<void> {
    const prompt = input.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt cannot be empty");
    }
    const prior = this.queues.get(input.agentId) ?? Promise.resolve();
    const next = prior.then(async () => this.runPrompt(input.agentId, prompt));
    this.queues.set(input.agentId, next);
    await next;
  }

  async stopAgent(agentId: string): Promise<AgentRecord> {
    const thisAgent = this.db.getAgentOrThrow(agentId);
    const active = this.activeRuns.get(agentId);
    if (active) {
      active.abortController.abort();
      await active.provider.stop({ sessionId: active.sessionId });
      this.activeRuns.delete(agentId);
    }
    const stopped = this.db.setAgentStatus(thisAgent.id, "stopped", null);
    this.hub.broadcastAgentUpdate(stopped);
    return stopped;
  }

  async archiveAgent(agentId: string): Promise<AgentRecord> {
    await this.stopAgent(agentId);
    const archived = this.db.archiveAgent(agentId);
    this.hub.broadcastAgentUpdate(archived);
    return archived;
  }

  private async runPrompt(agentId: string, prompt: string): Promise<void> {
    const latest = this.db.getAgentOrThrow(agentId);
    if (latest.status === "archived") {
      throw new Error(`Agent ${agentId} is archived`);
    }
    if (latest.permissionMode === "deny") {
      throw new Error(`Agent ${agentId} is in deny mode and cannot execute prompts`);
    }
    if (latest.permissionMode === "ask") {
      const permission = this.db.createPermissionRequest({
        agentId,
        workspaceId: latest.workspaceId,
        action: "agent_send",
        reason: `Approval required before running prompt for agent ${agentId}`,
        payloadJson: JSON.stringify({
          promptPreview: prompt.slice(0, 600),
          mode: latest.mode,
        }),
        expiresAt: new Date(Date.now() + this.config.permissionRequestTimeoutMs).toISOString(),
      });
      this.hooks.onPermissionRequest(permission);
      const decision = await this.hooks.waitForPermissionDecision(permission.id, this.config.permissionRequestTimeoutMs);
      if (decision === "approved") {
        const approved = this.db.updatePermissionDecision(permission.id, "approved");
        this.hooks.onPermissionRequest(approved);
      } else if (decision === "denied") {
        const denied = this.db.updatePermissionDecision(permission.id, "denied");
        this.hooks.onPermissionRequest(denied);
      }
      if (decision !== "approved") {
        throw new Error(
          decision === "expired"
            ? `Permission request expired for agent ${agentId}`
            : `Permission denied for agent ${agentId}`,
        );
      }
    }

    const provider = this.providers.get(latest.provider);
    if (!latest.sessionId) {
      throw new Error(`Agent ${agentId} has no provider session`);
    }
    const availability = await provider.isAvailable();
    if (!availability.available) {
      const errored = this.db.setAgentStatus(
        agentId,
        "error",
        `Provider '${latest.provider}' unavailable: ${availability.reason ?? "Unknown reason"}`,
      );
      this.hub.broadcastAgentUpdate(errored);
      throw new Error(errored.lastError ?? "Provider unavailable");
    }

    const running = this.db.setAgentStatus(agentId, "running", null);
    this.hub.broadcastAgentUpdate(running);

    const abortController = new AbortController();
    this.activeRuns.set(agentId, {
      provider,
      sessionId: latest.sessionId,
      abortController,
    });

    const transformedPrompt = this.transformPromptForMode(prompt, latest.mode);

    try {
      for await (const item of provider.send({
        sessionId: latest.sessionId,
        cwd: latest.cwd,
        prompt: transformedPrompt,
        model: latest.model ?? undefined,
        signal: abortController.signal,
      })) {
        const event = this.db.appendEvent({
          agentId,
          eventType: item.eventType,
          text: item.text,
          marker: item.marker,
        });
        this.db.setAgentCursor(agentId, item.marker ?? null);
        this.hub.broadcastAgentStream(agentId, event);

        const compact = this.db.compactEventsForAgent(
          agentId,
          this.config.maxEventsPerAgent,
          this.config.targetEventsPerAgent,
        );
        if (compact.compacted && compact.summaryEvent) {
          this.hub.broadcastAgentStream(agentId, compact.summaryEvent);
        }
      }
      const done = this.db.setAgentStatus(agentId, "idle", null);
      this.hub.broadcastAgentUpdate(done);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = this.db.setAgentStatus(agentId, "error", message);
      this.hub.broadcastAgentUpdate(failed);
      throw error;
    } finally {
      this.activeRuns.delete(agentId);
    }
  }

  private transformPromptForMode(prompt: string, mode: AgentMode): string {
    if (mode === "plan") {
      return `Plan mode only. Provide a concrete implementation plan and do not execute commands.\n\n${prompt}`;
    }
    if (mode === "auto") {
      return `Autonomous mode enabled. Optimize for fast execution and concise status updates.\n\n${prompt}`;
    }
    return prompt;
  }
}

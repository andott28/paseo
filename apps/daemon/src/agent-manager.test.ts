import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { AgentRecord, AgentStreamEvent } from "@gaa/protocol";
import { DatabaseService } from "./db.js";
import { AgentManager } from "./agent-manager.js";
import { ProviderRegistry } from "./providers/registry.js";
import type { AgentProviderAdapter } from "./providers/types.js";
import type { WsHub } from "./ws-hub.js";

class FakeHub implements Pick<WsHub, "broadcastAgentUpdate" | "broadcastAgentStream"> {
  readonly updates: AgentRecord[] = [];
  readonly streams: Array<{ agentId: string; event: AgentStreamEvent }> = [];

  broadcastAgentUpdate(agent: AgentRecord): void {
    this.updates.push(agent);
  }

  broadcastAgentStream(agentId: string, event: AgentStreamEvent): void {
    this.streams.push({ agentId, event });
  }
}

function withFixture(
  run: (ctx: { db: DatabaseService; manager: AgentManager; hub: FakeHub }) => Promise<void> | void,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "gaa-agent-manager-"));
  const db = new DatabaseService(join(dir, "daemon.db"));
  const hub = new FakeHub();
  const registry = new ProviderRegistry();
  registry.register({
    id: "codex",
    async isAvailable() {
      return { available: true };
    },
    async createSession() {
      return { sessionId: "session-1" };
    },
    async *send() {
      yield { eventType: "assistant_text", text: "hello", marker: "m1" };
      yield { eventType: "assistant_text", text: "world", marker: "m2" };
    },
    async stop() {
      return;
    },
  } satisfies AgentProviderAdapter);
  const manager = new AgentManager({
    db,
    providers: registry,
    hub: hub as unknown as WsHub,
    config: {
      maxEventsPerAgent: 200,
      targetEventsPerAgent: 120,
      permissionRequestTimeoutMs: 2000,
    },
    hooks: {
      onPermissionRequest() {
        return;
      },
      async waitForPermissionDecision() {
        return "approved";
      },
    },
  });

  return Promise.resolve(run({ db, manager, hub })).finally(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

describe("AgentManager", () => {
  it("creates agent and streams follow-up prompt in same timeline", async () => {
    await withFixture(async ({ manager, hub }) => {
      const created = await manager.createAgent({
        provider: "codex",
        cwd: process.cwd(),
        prompt: "Say hello",
      });

      expect(created.provider).toBe("codex");
      const events = manager.listAgentEvents(created.id);
      expect(events.map((event) => event.text)).toEqual(["hello", "world"]);
      const latestStatus = manager.listAgents().find((agent) => agent.id === created.id)?.status;
      expect(latestStatus).toBe("idle");
      expect(hub.streams.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("stops and archives an agent", async () => {
    await withFixture(async ({ manager }) => {
      const created = await manager.createAgent({
        provider: "codex",
        cwd: process.cwd(),
      });
      const stopped = await manager.stopAgent(created.id);
      expect(stopped.status).toBe("stopped");
      const archived = await manager.archiveAgent(created.id);
      expect(archived.status).toBe("archived");
      expect(archived.archivedAt).not.toBeNull();
    });
  });

  it("requests permission when ask-mode agent sends prompt", async () => {
    await withFixture(async ({ manager, db }) => {
      const created = await manager.createAgent({
        provider: "codex",
        cwd: process.cwd(),
        permissionMode: "ask",
      });
      await manager.sendPrompt({
        agentId: created.id,
        prompt: "hi",
      });
      const permissions = db.listPermissionRequests("approved");
      expect(permissions.length).toBeGreaterThanOrEqual(1);
    });
  });
});

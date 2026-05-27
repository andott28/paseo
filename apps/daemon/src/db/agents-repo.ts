import type { AgentMode, AgentRecord, AgentStatus, AgentStreamEvent, PermissionMode } from "@gaa/protocol";
import type { DbCore } from "./core.js";

export class AgentsRepo {
  constructor(private readonly core: DbCore) {}

  create(input: {
    workspaceId?: string | null;
    parentAgentId?: string | null;
    provider: string;
    cwd: string;
    title?: string;
    model?: string;
    sessionId: string;
    mode?: AgentMode;
    permissionMode?: PermissionMode;
  }): AgentRecord {
    return this.core.service.createAgent(input);
  }

  list(): AgentRecord[] {
    return this.core.service.listAgents();
  }

  get(agentId: string): AgentRecord | null {
    return this.core.service.getAgent(agentId);
  }

  listForWorkspace(workspaceId: string): AgentRecord[] {
    return this.core.service.listAgentsForWorkspace(workspaceId);
  }

  listSubagents(parentAgentId: string): AgentRecord[] {
    return this.core.service.listChildAgents(parentAgentId);
  }

  setStatus(agentId: string, status: AgentStatus, lastError: string | null = null): AgentRecord {
    return this.core.service.setAgentStatus(agentId, status, lastError);
  }

  setModes(agentId: string, input: { mode?: AgentMode; permissionMode?: PermissionMode }): AgentRecord {
    return this.core.service.setAgentModes(agentId, input);
  }

  archive(agentId: string): AgentRecord {
    return this.core.service.archiveAgent(agentId);
  }

  appendEvent(input: { agentId: string; eventType: AgentStreamEvent["eventType"]; text: string; marker?: string | null }): AgentStreamEvent {
    return this.core.service.appendEvent(input);
  }

  listEvents(agentId: string, limit: number): AgentStreamEvent[] {
    return this.core.service.listEvents(agentId, limit);
  }
}

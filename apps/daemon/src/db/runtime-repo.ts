import type { McpServerRecord, RelaySessionRecord, VoiceChunkEvent, VoiceSessionRecord } from "@gaa/protocol";
import type { DbCore } from "./core.js";

export class RuntimeRepo {
  constructor(private readonly core: DbCore) {}

  createMcpServer(input: { name: string; command: string; args?: string[]; cwd?: string; env?: Record<string, string> }): McpServerRecord {
    return this.core.service.createMcpServer(input);
  }

  listMcpServers(): McpServerRecord[] {
    return this.core.service.listMcpServers();
  }

  createRelaySession(clientName: string): RelaySessionRecord {
    return this.core.service.createRelaySession(clientName);
  }

  listRelaySessions(): RelaySessionRecord[] {
    return this.core.service.listRelaySessions();
  }

  createVoiceSession(input: { workspaceId?: string | null; agentId?: string | null }): VoiceSessionRecord {
    return this.core.service.createVoiceSession(input);
  }

  listVoiceSessions(): VoiceSessionRecord[] {
    return this.core.service.listVoiceSessions();
  }

  appendVoiceEvent(input: { voiceSessionId: string; role: VoiceChunkEvent["role"]; text: string }): VoiceChunkEvent {
    return this.core.service.appendVoiceEvent(input);
  }

  listVoiceEvents(voiceSessionId: string, limit = 400): VoiceChunkEvent[] {
    return this.core.service.listVoiceEvents(voiceSessionId, limit);
  }
}

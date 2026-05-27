import type { VoiceChunkEvent, VoiceSessionRecord } from "@gaa/protocol";
import type { AgentManager } from "./agent-manager.js";
import type { DatabaseService } from "./db.js";

interface VoiceManagerHooks {
  onVoiceSessionUpdate(session: VoiceSessionRecord): void;
  onVoiceChunk(event: VoiceChunkEvent): void;
}

export class VoiceManager {
  private readonly db: DatabaseService;
  private readonly agents: AgentManager;
  private readonly hooks: VoiceManagerHooks;

  constructor(input: { db: DatabaseService; agents: AgentManager; hooks: VoiceManagerHooks }) {
    this.db = input.db;
    this.agents = input.agents;
    this.hooks = input.hooks;
  }

  listVoiceSessions(): VoiceSessionRecord[] {
    return this.db.listVoiceSessions();
  }

  listVoiceEvents(voiceSessionId: string, limit = 400): VoiceChunkEvent[] {
    return this.db.listVoiceEvents(voiceSessionId, limit);
  }

  createVoiceSession(input: { workspaceId?: string; agentId?: string }): VoiceSessionRecord {
    const session = this.db.createVoiceSession({
      workspaceId: input.workspaceId ?? null,
      agentId: input.agentId ?? null,
    });
    this.hooks.onVoiceSessionUpdate(session);
    return session;
  }

  endVoiceSession(voiceSessionId: string): VoiceSessionRecord {
    const session = this.db.setVoiceSessionStatus(voiceSessionId, "ended");
    this.hooks.onVoiceSessionUpdate(session);
    return session;
  }

  async ingestText(input: {
    voiceSessionId: string;
    text: string;
    sendToAgent?: boolean;
  }): Promise<VoiceChunkEvent> {
    const session = this.db.getVoiceSessionOrThrow(input.voiceSessionId);
    const event = this.db.appendVoiceEvent({
      voiceSessionId: session.id,
      role: "user",
      text: input.text,
    });
    this.hooks.onVoiceChunk(event);
    if (input.sendToAgent && session.agentId) {
      await this.agents.sendPrompt({ agentId: session.agentId, prompt: input.text });
      const systemEvent = this.db.appendVoiceEvent({
        voiceSessionId: session.id,
        role: "system",
        text: "Prompt forwarded to linked agent",
      });
      this.hooks.onVoiceChunk(systemEvent);
    }
    return event;
  }
}

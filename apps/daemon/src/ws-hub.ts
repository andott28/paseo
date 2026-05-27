import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import {
  parseEnvelope,
  type AgentRecord,
  type AgentStreamEvent,
  type McpServerRecord,
  type PermissionRequestRecord,
  type ProjectRecord,
  type RelaySessionRecord,
  type ScheduleRecord,
  type TerminalOutputEvent,
  type TerminalRecord,
  type VoiceChunkEvent,
  type VoiceSessionRecord,
  type WorkspaceRecord,
  type WsEnvelope,
} from "@gaa/protocol";
import { WebSocket, WebSocketServer } from "ws";

interface WsHubHandlers {
  validateAuthToken(authToken: string): boolean;
  listAgents(): AgentRecord[];
  listProjects(): ProjectRecord[];
  listWorkspaces(): WorkspaceRecord[];
  listTerminals(): TerminalRecord[];
  listPermissions(): PermissionRequestRecord[];
  listSchedules(): ScheduleRecord[];
  listMcpServers(): McpServerRecord[];
  listRelaySessions(): RelaySessionRecord[];
  listVoiceSessions(): VoiceSessionRecord[];
  handleCreate(input: {
    requestId?: string;
    payload: {
      provider: string;
      cwd: string;
      prompt?: string;
      title?: string;
      model?: string;
      workspaceId?: string;
      parentAgentId?: string;
      mode?: "chat" | "plan" | "auto";
      permissionMode?: "allow" | "ask" | "deny";
    };
  }): Promise<void>;
  handleSend(input: { requestId?: string; payload: { agentId: string; prompt: string } }): Promise<void>;
  handleStop(input: { requestId?: string; payload: { agentId: string } }): Promise<void>;
  handleArchive(input: { requestId?: string; payload: { agentId: string } }): Promise<void>;
  handleSetMode(input: {
    requestId?: string;
    payload: { agentId: string; mode?: "chat" | "plan" | "auto"; permissionMode?: "allow" | "ask" | "deny" };
  }): Promise<void>;
  handleTerminalCreate(input: {
    requestId?: string;
    payload: { workspaceId?: string; cwd?: string; command?: string };
  }): Promise<void>;
  handleTerminalInput(input: {
    requestId?: string;
    payload: { terminalId: string; input: string };
  }): Promise<void>;
  handleTerminalKill(input: {
    requestId?: string;
    payload: { terminalId: string };
  }): Promise<void>;
  handlePermissionCreate(input: {
    requestId?: string;
    payload: { agentId?: string; workspaceId?: string; action: string; reason: string; payloadJson?: string; expiresInSeconds?: number };
  }): Promise<void>;
  handlePermissionDecide(input: {
    requestId?: string;
    payload: { permissionId: string; decision: "approved" | "denied"; note?: string };
  }): Promise<void>;
  handleScheduleCreate(input: {
    requestId?: string;
    payload: { workspaceId?: string; agentId?: string; provider: string; cwd: string; prompt: string; intervalSeconds: number };
  }): Promise<void>;
  handleSchedulePause(input: { requestId?: string; payload: { scheduleId: string } }): Promise<void>;
  handleScheduleResume(input: { requestId?: string; payload: { scheduleId: string } }): Promise<void>;
  handleScheduleRunNow(input: { requestId?: string; payload: { scheduleId: string } }): Promise<void>;
  handleMcpRegister(input: {
    requestId?: string;
    payload: { name: string; command: string; args?: string[]; cwd?: string; env?: Record<string, string> };
  }): Promise<void>;
  handleMcpStart(input: { requestId?: string; payload: { serverId: string } }): Promise<void>;
  handleMcpStop(input: { requestId?: string; payload: { serverId: string } }): Promise<void>;
  handleMcpRemove(input: { requestId?: string; payload: { serverId: string } }): Promise<void>;
  handleVoiceSessionCreate(input: {
    requestId?: string;
    payload: { workspaceId?: string; agentId?: string };
  }): Promise<void>;
  handleVoiceChunkInput(input: {
    requestId?: string;
    payload: { voiceSessionId: string; text: string; sendToAgent?: boolean };
  }): Promise<void>;
}

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  authenticated: boolean;
}

export class WsHub {
  private readonly serverId: string;
  private readonly handlers: WsHubHandlers;
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<string, ConnectedClient>();
  private onBroadcast?: (message: WsEnvelope) => void;

  constructor(serverId: string, handlers: WsHubHandlers) {
    this.serverId = serverId;
    this.handlers = handlers;
    this.wss = new WebSocketServer({ noServer: true });
    this.wss.on("connection", (ws) => this.onConnection(ws));
  }

  attach(server: HttpServer): void {
    server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (requestUrl.pathname !== "/ws") {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit("connection", ws, request);
      });
    });
  }

  setBroadcastObserver(observer: (message: WsEnvelope) => void): void {
    this.onBroadcast = observer;
  }

  broadcastAgentUpdate(agent: AgentRecord): void {
    this.broadcast({
      type: "agent_update",
      payload: { agent },
    });
  }

  broadcastAgentStream(agentId: string, event: AgentStreamEvent): void {
    this.broadcast({
      type: "agent_stream",
      payload: { agentId, event },
    });
  }

  broadcastProjectUpdate(project: ProjectRecord): void {
    this.broadcast({
      type: "project_update",
      payload: { project },
    });
  }

  broadcastWorkspaceUpdate(workspace: WorkspaceRecord): void {
    this.broadcast({
      type: "workspace_update",
      payload: { workspace },
    });
  }

  broadcastTerminalUpdate(terminal: TerminalRecord): void {
    this.broadcast({
      type: "terminal_update",
      payload: { terminal },
    });
  }

  broadcastTerminalOutput(event: TerminalOutputEvent): void {
    this.broadcast({
      type: "terminal_output",
      payload: { event },
    });
  }

  broadcastPermissionUpdate(permission: PermissionRequestRecord): void {
    this.broadcast({
      type: "permission_update",
      payload: { permission },
    });
  }

  broadcastScheduleUpdate(schedule: ScheduleRecord): void {
    this.broadcast({
      type: "schedule_update",
      payload: { schedule },
    });
  }

  broadcastMcpServerUpdate(server: McpServerRecord): void {
    this.broadcast({
      type: "mcp_server_update",
      payload: { server },
    });
  }

  broadcastRelaySessionUpdate(relaySession: RelaySessionRecord): void {
    this.broadcast({
      type: "relay_session_update",
      payload: { relaySession },
    });
  }

  broadcastVoiceSessionUpdate(voiceSession: VoiceSessionRecord): void {
    this.broadcast({
      type: "voice_session_update",
      payload: { voiceSession },
    });
  }

  broadcastVoiceChunk(event: VoiceChunkEvent): void {
    this.broadcast({
      type: "voice_chunk",
      payload: { event },
    });
  }

  getStats(): { connectedClients: number; authenticatedClients: number } {
    let authenticatedClients = 0;
    for (const client of this.clients.values()) {
      if (client.authenticated) authenticatedClients += 1;
    }
    return {
      connectedClients: this.clients.size,
      authenticatedClients,
    };
  }

  async handleRelayEnvelope(envelope: WsEnvelope): Promise<void> {
    const parsed = parseEnvelope(envelope);
    await this.dispatchAuthenticatedEnvelope(parsed);
  }

  private onConnection(ws: WebSocket): void {
    const id = randomUUID();
    const connected: ConnectedClient = { id, ws, authenticated: false };
    this.clients.set(id, connected);

    const handshakeTimeout = setTimeout(() => {
      if (!connected.authenticated) {
        this.send(ws, {
          type: "error",
          payload: {
            code: "AUTH_REQUIRED",
            message: "Expected hello/auth handshake before any command",
          },
        });
        ws.close(1008, "auth_required");
      }
    }, 10000);

    ws.on("message", async (raw) => {
      let parsed: WsEnvelope;
      try {
        parsed = parseEnvelope(JSON.parse(raw.toString()));
      } catch (error) {
        this.send(ws, {
          type: "error",
          payload: {
            code: "INVALID_ENVELOPE",
            message: error instanceof Error ? error.message : "Malformed message",
          },
        });
        return;
      }

      if (!connected.authenticated) {
        if (parsed.type !== "hello") {
          this.send(ws, {
            type: "error",
            requestId: parsed.requestId,
            payload: {
              code: "AUTH_REQUIRED",
              message: "Send hello first",
            },
          });
          return;
        }
        const authToken = String((parsed.payload as { authToken: string }).authToken);
        const valid = this.handlers.validateAuthToken(authToken);
        if (!valid) {
          this.send(ws, {
            type: "error",
            requestId: parsed.requestId,
            payload: {
              code: "AUTH_INVALID",
              message: "Auth token is invalid or revoked",
            },
          });
          ws.close(1008, "invalid_auth");
          return;
        }
        clearTimeout(handshakeTimeout);
        connected.authenticated = true;
        this.send(ws, {
          type: "welcome",
          requestId: parsed.requestId,
          payload: {
            serverId: this.serverId,
            now: new Date().toISOString(),
            agents: this.handlers.listAgents(),
            projects: this.handlers.listProjects(),
            workspaces: this.handlers.listWorkspaces(),
            terminals: this.handlers.listTerminals(),
            permissions: this.handlers.listPermissions(),
            schedules: this.handlers.listSchedules(),
            mcpServers: this.handlers.listMcpServers(),
            relaySessions: this.handlers.listRelaySessions(),
            voiceSessions: this.handlers.listVoiceSessions(),
          },
        });
        return;
      }

      try {
        await this.dispatchAuthenticatedEnvelope(parsed);
      } catch (error) {
        this.send(ws, {
          type: "error",
          requestId: parsed.requestId,
          payload: {
            code: "COMMAND_FAILED",
            message: error instanceof Error ? error.message : "Unknown command error",
          },
        });
      }
    });

    ws.on("close", () => {
      clearTimeout(handshakeTimeout);
      this.clients.delete(id);
    });
  }

  private async dispatchAuthenticatedEnvelope(parsed: WsEnvelope): Promise<void> {
    if (parsed.type === "agent_create") {
      await this.handlers.handleCreate({
        requestId: parsed.requestId,
        payload: parsed.payload as {
          provider: string;
          cwd: string;
          prompt?: string;
          title?: string;
          model?: string;
          workspaceId?: string;
          parentAgentId?: string;
          mode?: "chat" | "plan" | "auto";
          permissionMode?: "allow" | "ask" | "deny";
        },
      });
      return;
    }
    if (parsed.type === "agent_send") {
      await this.handlers.handleSend({
        requestId: parsed.requestId,
        payload: parsed.payload as { agentId: string; prompt: string },
      });
      return;
    }
    if (parsed.type === "agent_stop") {
      await this.handlers.handleStop({
        requestId: parsed.requestId,
        payload: parsed.payload as { agentId: string },
      });
      return;
    }
    if (parsed.type === "agent_archive") {
      await this.handlers.handleArchive({
        requestId: parsed.requestId,
        payload: parsed.payload as { agentId: string },
      });
      return;
    }
    if (parsed.type === "agent_set_mode") {
      await this.handlers.handleSetMode({
        requestId: parsed.requestId,
        payload: parsed.payload as {
          agentId: string;
          mode?: "chat" | "plan" | "auto";
          permissionMode?: "allow" | "ask" | "deny";
        },
      });
      return;
    }
    if (parsed.type === "terminal_create") {
      await this.handlers.handleTerminalCreate({
        requestId: parsed.requestId,
        payload: parsed.payload as { workspaceId?: string; cwd?: string; command?: string },
      });
      return;
    }
    if (parsed.type === "terminal_input") {
      await this.handlers.handleTerminalInput({
        requestId: parsed.requestId,
        payload: parsed.payload as { terminalId: string; input: string },
      });
      return;
    }
    if (parsed.type === "terminal_kill") {
      await this.handlers.handleTerminalKill({
        requestId: parsed.requestId,
        payload: parsed.payload as { terminalId: string },
      });
      return;
    }
    if (parsed.type === "permission_create") {
      await this.handlers.handlePermissionCreate({
        requestId: parsed.requestId,
        payload: parsed.payload as {
          agentId?: string;
          workspaceId?: string;
          action: string;
          reason: string;
          payloadJson?: string;
          expiresInSeconds?: number;
        },
      });
      return;
    }
    if (parsed.type === "permission_decide") {
      await this.handlers.handlePermissionDecide({
        requestId: parsed.requestId,
        payload: parsed.payload as { permissionId: string; decision: "approved" | "denied"; note?: string },
      });
      return;
    }
    if (parsed.type === "schedule_create") {
      await this.handlers.handleScheduleCreate({
        requestId: parsed.requestId,
        payload: parsed.payload as {
          workspaceId?: string;
          agentId?: string;
          provider: string;
          cwd: string;
          prompt: string;
          intervalSeconds: number;
        },
      });
      return;
    }
    if (parsed.type === "schedule_pause") {
      await this.handlers.handleSchedulePause({
        requestId: parsed.requestId,
        payload: parsed.payload as { scheduleId: string },
      });
      return;
    }
    if (parsed.type === "schedule_resume") {
      await this.handlers.handleScheduleResume({
        requestId: parsed.requestId,
        payload: parsed.payload as { scheduleId: string },
      });
      return;
    }
    if (parsed.type === "schedule_run_now") {
      await this.handlers.handleScheduleRunNow({
        requestId: parsed.requestId,
        payload: parsed.payload as { scheduleId: string },
      });
      return;
    }
    if (parsed.type === "mcp_server_register") {
      await this.handlers.handleMcpRegister({
        requestId: parsed.requestId,
        payload: parsed.payload as {
          name: string;
          command: string;
          args?: string[];
          cwd?: string;
          env?: Record<string, string>;
        },
      });
      return;
    }
    if (parsed.type === "mcp_server_start") {
      await this.handlers.handleMcpStart({
        requestId: parsed.requestId,
        payload: parsed.payload as { serverId: string },
      });
      return;
    }
    if (parsed.type === "mcp_server_stop") {
      await this.handlers.handleMcpStop({
        requestId: parsed.requestId,
        payload: parsed.payload as { serverId: string },
      });
      return;
    }
    if (parsed.type === "mcp_server_remove") {
      await this.handlers.handleMcpRemove({
        requestId: parsed.requestId,
        payload: parsed.payload as { serverId: string },
      });
      return;
    }
    if (parsed.type === "voice_session_create") {
      await this.handlers.handleVoiceSessionCreate({
        requestId: parsed.requestId,
        payload: parsed.payload as { workspaceId?: string; agentId?: string },
      });
      return;
    }
    if (parsed.type === "voice_chunk_input") {
      await this.handlers.handleVoiceChunkInput({
        requestId: parsed.requestId,
        payload: parsed.payload as { voiceSessionId: string; text: string; sendToAgent?: boolean },
      });
      return;
    }
    if (parsed.type === "hello" || parsed.type === "welcome" || parsed.type === "error") {
      return;
    }
    throw new Error(`Unsupported command type: ${parsed.type}`);
  }

  private broadcast(message: WsEnvelope): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (!client.authenticated) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
    if (this.onBroadcast) {
      this.onBroadcast(message);
    }
  }

  private send(ws: WebSocket, message: WsEnvelope): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

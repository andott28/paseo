import { createServer } from "node:http";
import type { PermissionRequestRecord } from "@gaa/protocol";
import { AgentManager } from "./agent-manager.js";
import { loadConfig, type AppConfig } from "./config.js";
import { DatabaseService } from "./db.js";
import { applyCors, extractBearerToken, json } from "./http/utils.js";
import { McpManager } from "./mcp-manager.js";
import { PermissionGate } from "./permission-gate.js";
import { buildDefaultProviderRegistry } from "./providers/index.js";
import { RelayManager } from "./relay-manager.js";
import { createAuthedRoutes } from "./routes/auth-routes.js";
import { createPublicRoutes } from "./routes/public-routes.js";
import { ScheduleService } from "./schedule-service.js";
import { TerminalManager } from "./terminal-manager.js";
import { VoiceManager } from "./voice-manager.js";
import { WsHub } from "./ws-hub.js";

export class Daemon {
  private server: ReturnType<typeof createServer> | null = null;
  private config: AppConfig;
  private db: DatabaseService;
  private hub: WsHub;
  private manager: AgentManager;
  private terminalManager: TerminalManager;
  private scheduleService: ScheduleService;
  private mcpManager: McpManager;
  private relayManager: RelayManager;
  private voiceManager: VoiceManager;
  private providers: ReturnType<typeof buildDefaultProviderRegistry>;
  private permissionGate: PermissionGate;
  private permissionSweepTimer: ReturnType<typeof setInterval> | null = null;
  private _serverId: string;

  constructor(config?: Partial<AppConfig>) {
    const defaults = loadConfig();
    this.config = { ...defaults, ...config } as AppConfig;
    this.db = new DatabaseService(this.config.GAA_DB_PATH);
    this._serverId = this.db.getOrCreateServerId();
    this.providers = buildDefaultProviderRegistry(this.config);
    this.permissionGate = new PermissionGate();

    let manager: AgentManager;
    let relayManager: RelayManager;
    let mcpManager: McpManager;
    let voiceManager: VoiceManager;
    let scheduleService: ScheduleService;

    this.terminalManager = new TerminalManager({
      onUpdate: (terminal) => this.hub.broadcastTerminalUpdate(terminal),
      onOutput: (event) => this.hub.broadcastTerminalOutput(event),
    });

    this.hub = new WsHub(this._serverId, {
      validateAuthToken: (authToken) => this.db.isAuthTokenActive(authToken),
      listAgents: () => manager.listAgents(),
      listProjects: () => this.db.listProjects(),
      listWorkspaces: () => this.db.listWorkspaces(),
      listTerminals: () => this.terminalManager.listTerminals(),
      listPermissions: () => this.db.listPermissionRequests(),
      listSchedules: () => this.db.listSchedules(),
      listMcpServers: () => mcpManager.listServers(),
      listRelaySessions: () => relayManager.listSessions(),
      listVoiceSessions: () => voiceManager.listVoiceSessions(),
      handleCreate: async (input) => {
        await manager.createAgent(input.payload);
      },
      handleSend: async (input) => {
        await manager.sendPrompt(input.payload);
      },
      handleStop: async (input) => {
        await manager.stopAgent(input.payload.agentId);
      },
      handleArchive: async (input) => {
        await manager.archiveAgent(input.payload.agentId);
      },
      handleSetMode: async (input) => {
        manager.setAgentModes(input.payload.agentId, input.payload);
      },
      handleTerminalCreate: async (input) => {
        const workspace = input.payload.workspaceId ? this.db.getWorkspace(input.payload.workspaceId) : null;
        const cwd = input.payload.cwd?.trim() || workspace?.rootPath || process.cwd();
        this.terminalManager.createTerminal({ workspaceId: workspace?.id ?? null, cwd, command: input.payload.command });
      },
      handleTerminalInput: async (input) => {
        this.terminalManager.sendInput({ terminalId: input.payload.terminalId, data: input.payload.input });
      },
      handleTerminalKill: async (input) => {
        this.terminalManager.killTerminal(input.payload.terminalId);
      },
      handlePermissionCreate: async (input) => {
        const permission = this.createPermissionRequest(input.payload);
        this.hub.broadcastPermissionUpdate(permission);
      },
      handlePermissionDecide: async (input) => {
        await this.decidePermission(input.payload.permissionId, input.payload.decision, input.payload.note);
      },
      handleScheduleCreate: async (input) => {
        const schedule = this.db.createSchedule(input.payload);
        this.hub.broadcastScheduleUpdate(schedule);
      },
      handleSchedulePause: async (input) => {
        this.hub.broadcastScheduleUpdate(this.db.setScheduleStatus(input.payload.scheduleId, "paused", null));
      },
      handleScheduleResume: async (input) => {
        this.hub.broadcastScheduleUpdate(this.db.setScheduleStatus(input.payload.scheduleId, "active", null));
      },
      handleScheduleRunNow: async (input) => {
        this.hub.broadcastScheduleUpdate(await scheduleService.runNow(input.payload.scheduleId));
      },
      handleMcpRegister: async (input) => {
        this.hub.broadcastMcpServerUpdate(mcpManager.registerServer(input.payload));
      },
      handleMcpStart: async (input) => {
        this.hub.broadcastMcpServerUpdate(await mcpManager.startServer(input.payload.serverId));
      },
      handleMcpStop: async (input) => {
        this.hub.broadcastMcpServerUpdate(mcpManager.stopServer(input.payload.serverId));
      },
      handleMcpRemove: async (input) => {
        mcpManager.removeServer(input.payload.serverId);
      },
      handleVoiceSessionCreate: async (input) => {
        this.hub.broadcastVoiceSessionUpdate(voiceManager.createVoiceSession(input.payload));
      },
      handleVoiceChunkInput: async (input) => {
        this.hub.broadcastVoiceChunk(await voiceManager.ingestText(input.payload));
      },
    });

    manager = new AgentManager({
      db: this.db,
      providers: this.providers,
      hub: this.hub,
      config: {
        maxEventsPerAgent: this.config.GAA_MAX_EVENTS_PER_AGENT,
        targetEventsPerAgent: this.config.GAA_TARGET_EVENTS_PER_AGENT,
        permissionRequestTimeoutMs: 120000,
      },
      hooks: {
        onPermissionRequest: (permission) => this.hub.broadcastPermissionUpdate(permission),
        waitForPermissionDecision: async (permissionId, timeoutMs) => this.permissionGate.waitForDecision(permissionId, timeoutMs),
      },
    });
    this.manager = manager;
    relayManager = new RelayManager(this.db);
    this.relayManager = relayManager;
    this.hub.setBroadcastObserver((message) => this.relayManager.enqueueBroadcast(message));
    mcpManager = new McpManager({ db: this.db, hooks: { onServerUpdate: (server) => this.hub.broadcastMcpServerUpdate(server) } });
    this.mcpManager = mcpManager;
    scheduleService = new ScheduleService({
      db: this.db,
      agents: this.manager,
      hooks: {
        onScheduleUpdate: (schedule) => this.hub.broadcastScheduleUpdate(schedule),
        onScheduleError: (schedule) => this.hub.broadcastScheduleUpdate(schedule),
      },
    });
    this.scheduleService = scheduleService;
    voiceManager = new VoiceManager({
      db: this.db,
      agents: this.manager,
      hooks: {
        onVoiceSessionUpdate: (voiceSession) => this.hub.broadcastVoiceSessionUpdate(voiceSession),
        onVoiceChunk: (event) => this.hub.broadcastVoiceChunk(event),
      },
    });
    this.voiceManager = voiceManager;
  }

  get serverId(): string {
    return this._serverId;
  }

  async start(): Promise<void> {
    if (this.server) return;
    const publicRoutes = createPublicRoutes(this.createRouteContext());
    const authedRoutes = createAuthedRoutes(this.createRouteContext());
    const server = createServer(async (req, res) => {
      const method = req.method ?? "GET";
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const path = url.pathname;
      applyCors(res);
      if (method === "OPTIONS") return res.writeHead(204), res.end();
      try {
        const handledPublic = await publicRoutes({ req, res, url, method, path, authToken: "" });
        if (handledPublic) return;
        const authToken = extractBearerToken(req);
        if (!authToken || !this.db.isAuthTokenActive(authToken)) return json(res, 401, { code: "AUTH_REQUIRED", message: "Bearer auth token required" });
        const handledAuthed = await authedRoutes({ req, res, url, method, path, authToken });
        if (handledAuthed) return;
        return json(res, 404, { code: "NOT_FOUND", message: `No route: ${method} ${path}` });
      } catch (error) {
        return json(res, 500, { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : "Unknown error" });
      }
    });
    this.hub.attach(server);
    await new Promise<void>((resolve, reject) => {
      server.on("error", reject);
      server.listen(this.config.GAA_DAEMON_PORT, this.config.GAA_DAEMON_HOST, resolve);
    });
    this.server = server;
    this.scheduleService.start();
    this.permissionSweepTimer = setInterval(() => {
      const expired = this.db.expirePendingPermissions();
      for (const permission of expired) {
        this.permissionGate.resolve(permission.id, "expired");
        this.hub.broadcastPermissionUpdate(permission);
      }
    }, 1000);
    console.log(JSON.stringify({ level: "info", msg: "GAA daemon started", serverId: this._serverId, host: this.config.GAA_DAEMON_HOST, port: this.config.GAA_DAEMON_PORT, dbPath: this.config.GAA_DB_PATH }));
  }

  stop(): void {
    try { this.server?.close(); } catch {}
    this.server = null;
    try { this.scheduleService.stop(); } catch {}
    try { if (this.permissionSweepTimer) clearInterval(this.permissionSweepTimer); } catch {}
    this.permissionSweepTimer = null;
    try { this.terminalManager.stopAll(); } catch {}
    try { this.mcpManager.stopAll(); } catch {}
    try { this.db.close(); } catch {}
  }

  private createRouteContext() {
    return {
      config: this.config,
      serverId: this._serverId,
      db: this.db,
      manager: this.manager,
      hub: this.hub,
      terminalManager: this.terminalManager,
      scheduleService: this.scheduleService,
      mcpManager: this.mcpManager,
      relayManager: this.relayManager,
      voiceManager: this.voiceManager,
      permissionGate: this.permissionGate,
      providers: this.providers,
      createPermissionRequest: (input: { agentId?: string; workspaceId?: string; action: string; reason: string; payloadJson?: string; expiresInSeconds?: number }) =>
        this.createPermissionRequest(input),
      decidePermission: (permissionId: string, decision: "approved" | "denied", note?: string) =>
        this.decidePermission(permissionId, decision, note),
    };
  }

  private createPermissionRequest(input: { agentId?: string; workspaceId?: string; action: string; reason: string; payloadJson?: string; expiresInSeconds?: number }): PermissionRequestRecord {
    const expiresAt = input.expiresInSeconds && input.expiresInSeconds > 0 ? new Date(Date.now() + input.expiresInSeconds * 1000).toISOString() : null;
    return this.db.createPermissionRequest({ ...input, expiresAt });
  }

  private async decidePermission(permissionId: string, decision: "approved" | "denied", note?: string): Promise<PermissionRequestRecord> {
    const updated = this.db.updatePermissionDecision(permissionId, decision, note);
    this.permissionGate.resolve(permissionId, decision);
    this.hub.broadcastPermissionUpdate(updated);
    return updated;
  }
}

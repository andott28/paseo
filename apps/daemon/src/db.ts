import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type {
  AgentMode,
  AgentRecord,
  AgentStatus,
  AgentStreamEvent,
  McpServerRecord,
  McpServerStatus,
  PermissionMode,
  PermissionRequestRecord,
  PermissionStatus,
  ProjectRecord,
  RelaySessionRecord,
  RelaySessionStatus,
  ScheduleRecord,
  ScheduleStatus,
  VoiceChunkEvent,
  VoiceSessionRecord,
  VoiceSessionStatus,
  WorkspaceKind,
  WorkspaceRecord,
  WorkspaceStatus,
} from "@gaa/protocol";

export class DatabaseService {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        branch TEXT,
        status TEXT NOT NULL,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        parent_agent_id TEXT,
        provider TEXT NOT NULL,
        cwd TEXT NOT NULL,
        title TEXT,
        model TEXT,
        status TEXT NOT NULL,
        mode TEXT NOT NULL,
        permission_mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        archived_at TEXT,
        session_id TEXT,
        cursor_marker TEXT,
        last_error TEXT,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(parent_agent_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        text TEXT NOT NULL,
        marker TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(agent_id) REFERENCES agents(id),
        UNIQUE(agent_id, seq)
      );

      CREATE TABLE IF NOT EXISTS pairing_tokens (
        token TEXT PRIMARY KEY,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        token TEXT PRIMARY KEY,
        client_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS permission_requests (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        workspace_id TEXT,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        decision TEXT,
        requested_at TEXT NOT NULL,
        decided_at TEXT,
        expires_at TEXT,
        FOREIGN KEY(agent_id) REFERENCES agents(id),
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        agent_id TEXT,
        provider TEXT NOT NULL,
        cwd TEXT NOT NULL,
        prompt TEXT NOT NULL,
        interval_seconds INTEGER NOT NULL,
        status TEXT NOT NULL,
        next_run_at TEXT NOT NULL,
        last_run_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(agent_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        command TEXT NOT NULL,
        args_json TEXT NOT NULL,
        cwd TEXT NOT NULL,
        env_json TEXT NOT NULL,
        status TEXT NOT NULL,
        pid INTEGER,
        last_error TEXT,
        last_heartbeat_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS relay_sessions (
        id TEXT PRIMARY KEY,
        client_name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS voice_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        agent_id TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(agent_id) REFERENCES agents(id)
      );

      CREATE TABLE IF NOT EXISTS voice_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voice_session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(voice_session_id) REFERENCES voice_sessions(id),
        UNIQUE(voice_session_id, seq)
      );

      CREATE INDEX IF NOT EXISTS idx_agents_updated_at ON agents(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_agent_id_seq ON events(agent_id, seq);
      CREATE INDEX IF NOT EXISTS idx_pairing_tokens_expires ON pairing_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_projects_root_path ON projects(root_path);
      CREATE INDEX IF NOT EXISTS idx_workspaces_project_id ON workspaces(project_id);
      CREATE INDEX IF NOT EXISTS idx_permissions_status ON permission_requests(status, requested_at DESC);
      CREATE INDEX IF NOT EXISTS idx_permissions_agent_id ON permission_requests(agent_id);
      CREATE INDEX IF NOT EXISTS idx_schedules_status_next ON schedules(status, next_run_at);
      CREATE INDEX IF NOT EXISTS idx_voice_events_session_seq ON voice_events(voice_session_id, seq);
    `);

    this.ensureWorkspaceIdColumn("agents");
    this.ensureWorkspaceIdColumn("permission_requests");
    this.ensureWorkspaceIdColumn("schedules");
    this.ensureWorkspaceIdColumn("voice_sessions");
    this.ensureColumn("agents", "parent_agent_id", "TEXT");
    this.ensureColumn("agents", "mode", "TEXT NOT NULL DEFAULT 'chat'");
    this.ensureColumn("agents", "permission_mode", "TEXT NOT NULL DEFAULT 'allow'");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_agents_workspace_id ON agents(workspace_id)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_agents_parent_agent_id ON agents(parent_agent_id)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_voice_sessions_workspace ON voice_sessions(workspace_id)");
    this.db.exec("UPDATE agents SET mode = 'chat' WHERE mode IS NULL OR mode = ''");
    this.db.exec("UPDATE agents SET permission_mode = 'allow' WHERE permission_mode IS NULL OR permission_mode = ''");
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (!rows.some((row) => row.name === columnName)) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  private ensureWorkspaceIdColumn(tableName: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    const hasWorkspaceId = rows.some((row) => row.name === "workspace_id");
    if (!hasWorkspaceId) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN workspace_id TEXT`);
    }
    const legacyNames = ["workspace id", "workspaceId"];
    const legacy = rows.find((row) => legacyNames.includes(row.name));
    if (legacy) {
      this.db.exec(`UPDATE ${tableName} SET workspace_id = COALESCE(workspace_id, "${legacy.name}")`);
    }
  }

  getOrCreateServerId(): string {
    const existing = this.db.prepare("SELECT value FROM settings WHERE key = 'server_id'").get() as
      | { value: string }
      | undefined;
    if (existing?.value) {
      return existing.value;
    }
    const serverId = `srv_${randomUUID()}`;
    this.db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('server_id', ?)").run(serverId);
    return serverId;
  }

  createPairingToken(token: string, expiresAtIso: string): void {
    const createdAt = new Date().toISOString();
    this.db
      .prepare("INSERT INTO pairing_tokens(token, expires_at, used_at, created_at) VALUES(?, ?, NULL, ?)")
      .run(token, expiresAtIso, createdAt);
  }

  redeemPairingToken(token: string): boolean {
    const row = this.db.prepare("SELECT token, expires_at, used_at FROM pairing_tokens WHERE token = ?").get(
      token,
    ) as
      | { token: string; expires_at: string; used_at: string | null }
      | undefined;
    if (!row || row.used_at) {
      return false;
    }
    const expiresAtMs = Date.parse(row.expires_at);
    if (Number.isNaN(expiresAtMs) || expiresAtMs < Date.now()) {
      return false;
    }
    this.db.prepare("UPDATE pairing_tokens SET used_at = ? WHERE token = ?").run(new Date().toISOString(), token);
    return true;
  }

  createAuthToken(token: string, clientName: string): void {
    this.db
      .prepare("INSERT INTO auth_tokens(token, client_name, created_at, revoked_at) VALUES(?, ?, ?, NULL)")
      .run(token, clientName, new Date().toISOString());
  }

  isAuthTokenActive(token: string): boolean {
    const row = this.db
      .prepare("SELECT token FROM auth_tokens WHERE token = ? AND revoked_at IS NULL")
      .get(token) as { token: string } | undefined;
    return Boolean(row);
  }

  revokeAuthToken(token: string): void {
    this.db
      .prepare("UPDATE auth_tokens SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), token);
  }

  createAgent(input: {
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
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `
        INSERT INTO agents(
          id, workspace_id, parent_agent_id, provider, cwd, title, model, status, mode, permission_mode, created_at, updated_at, last_activity_at, archived_at, session_id, cursor_marker, last_error
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL)
      `,
      )
      .run(
        id,
        input.workspaceId ?? null,
        input.parentAgentId ?? null,
        input.provider,
        input.cwd,
        input.title ?? null,
        input.model ?? null,
        "initializing",
        input.mode ?? "chat",
        input.permissionMode ?? "allow",
        now,
        now,
        now,
        input.sessionId,
      );
    return this.getAgentOrThrow(id);
  }

  listAgents(): AgentRecord[] {
    const rows = this.db.prepare(
      `
      SELECT id, workspace_id, parent_agent_id, provider, cwd, title, model, status, mode, permission_mode, created_at, updated_at, last_activity_at, archived_at, session_id, cursor_marker, last_error
      FROM agents
      ORDER BY updated_at DESC
    `,
    ).all() as unknown as AgentDbRow[];
    return rows.map((row) => this.toAgentRecord(row));
  }

  getAgent(agentId: string): AgentRecord | null {
    const row = this.db.prepare(
      `
      SELECT id, workspace_id, parent_agent_id, provider, cwd, title, model, status, mode, permission_mode, created_at, updated_at, last_activity_at, archived_at, session_id, cursor_marker, last_error
      FROM agents
      WHERE id = ?
    `,
    ).get(agentId) as AgentDbRow | undefined;
    return row ? this.toAgentRecord(row) : null;
  }

  getAgentOrThrow(agentId: string): AgentRecord {
    const record = this.getAgent(agentId);
    if (!record) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return record;
  }

  listChildAgents(parentAgentId: string): AgentRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, workspace_id, parent_agent_id, provider, cwd, title, model, status, mode, permission_mode, created_at, updated_at, last_activity_at, archived_at, session_id, cursor_marker, last_error
         FROM agents WHERE parent_agent_id = ? ORDER BY updated_at DESC`,
      )
      .all(parentAgentId) as unknown as AgentDbRow[];
    return rows.map((row) => this.toAgentRecord(row));
  }

  setAgentStatus(agentId: string, status: AgentStatus, lastError: string | null = null): AgentRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE agents
      SET status = ?, last_error = ?, updated_at = ?, last_activity_at = ?
      WHERE id = ?
    `,
      )
      .run(status, lastError, now, now, agentId);
    return this.getAgentOrThrow(agentId);
  }

  setAgentCursor(agentId: string, cursorMarker: string | null): AgentRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE agents
      SET cursor_marker = ?, updated_at = ?, last_activity_at = ?
      WHERE id = ?
    `,
      )
      .run(cursorMarker, now, now, agentId);
    return this.getAgentOrThrow(agentId);
  }

  setAgentModes(agentId: string, input: { mode?: AgentMode; permissionMode?: PermissionMode }): AgentRecord {
    const existing = this.getAgentOrThrow(agentId);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE agents
      SET mode = ?, permission_mode = ?, updated_at = ?, last_activity_at = ?
      WHERE id = ?
    `,
      )
      .run(input.mode ?? existing.mode, input.permissionMode ?? existing.permissionMode, now, now, agentId);
    return this.getAgentOrThrow(agentId);
  }

  archiveAgent(agentId: string): AgentRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
      UPDATE agents
      SET status = 'archived', archived_at = ?, updated_at = ?, last_activity_at = ?
      WHERE id = ?
    `,
      )
      .run(now, now, now, agentId);
    return this.getAgentOrThrow(agentId);
  }

  createProject(input: { name: string; rootPath: string }): ProjectRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO projects(id, name, root_path, created_at, updated_at) VALUES(?, ?, ?, ?, ?)")
      .run(id, input.name, input.rootPath, now, now);
    return this.getProjectOrThrow(id);
  }

  listProjects(): ProjectRecord[] {
    const rows = this.db
      .prepare("SELECT id, name, root_path, created_at, updated_at FROM projects ORDER BY updated_at DESC")
      .all() as unknown as ProjectDbRow[];
    return rows.map((row) => this.toProjectRecord(row));
  }

  getProject(projectId: string): ProjectRecord | null {
    const row = this.db
      .prepare("SELECT id, name, root_path, created_at, updated_at FROM projects WHERE id = ?")
      .get(projectId) as ProjectDbRow | undefined;
    return row ? this.toProjectRecord(row) : null;
  }

  getProjectOrThrow(projectId: string): ProjectRecord {
    const record = this.getProject(projectId);
    if (!record) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return record;
  }

  findProjectByRootPath(rootPath: string): ProjectRecord | null {
    const row = this.db
      .prepare("SELECT id, name, root_path, created_at, updated_at FROM projects WHERE root_path = ?")
      .get(rootPath) as ProjectDbRow | undefined;
    return row ? this.toProjectRecord(row) : null;
  }

  createWorkspace(input: {
    projectId: string;
    name: string;
    rootPath: string;
    kind: WorkspaceKind;
    branch?: string | null;
  }): WorkspaceRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO workspaces(
          id, project_id, name, root_path, kind, branch, status, archived_at, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(id, input.projectId, input.name, input.rootPath, input.kind, input.branch ?? null, "active", now, now);
    return this.getWorkspaceOrThrow(id);
  }

  listWorkspaces(): WorkspaceRecord[] {
    const rows = this.db
      .prepare(
        "SELECT id, project_id, name, root_path, kind, branch, status, archived_at, created_at, updated_at FROM workspaces ORDER BY updated_at DESC",
      )
      .all() as unknown as WorkspaceDbRow[];
    return rows.map((row) => this.toWorkspaceRecord(row));
  }

  getWorkspace(workspaceId: string): WorkspaceRecord | null {
    const row = this.db
      .prepare(
        "SELECT id, project_id, name, root_path, kind, branch, status, archived_at, created_at, updated_at FROM workspaces WHERE id = ?",
      )
      .get(workspaceId) as WorkspaceDbRow | undefined;
    return row ? this.toWorkspaceRecord(row) : null;
  }

  getWorkspaceOrThrow(workspaceId: string): WorkspaceRecord {
    const record = this.getWorkspace(workspaceId);
    if (!record) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }
    return record;
  }

  listAgentsForWorkspace(workspaceId: string): AgentRecord[] {
    const rows = this.db.prepare(
      `SELECT id, workspace_id, parent_agent_id, provider, cwd, title, model, status, mode, permission_mode, created_at, updated_at, last_activity_at, archived_at, session_id, cursor_marker, last_error
       FROM agents WHERE workspace_id = ? ORDER BY updated_at DESC`,
    ).all(workspaceId) as unknown as AgentDbRow[];
    return rows.map((row) => this.toAgentRecord(row));
  }

  appendEvent(input: {
    agentId: string;
    eventType: AgentStreamEvent["eventType"];
    text: string;
    marker?: string | null;
  }): AgentStreamEvent {
    const createdAt = new Date().toISOString();
    const seq = this.nextSeq(input.agentId);
    const inserted = this.db
      .prepare(
        `
      INSERT INTO events(agent_id, seq, event_type, text, marker, created_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `,
      )
      .run(input.agentId, seq, input.eventType, input.text, input.marker ?? null, createdAt);
    const id = String(Number(inserted.lastInsertRowid));
    return {
      id,
      agentId: input.agentId,
      seq,
      eventType: input.eventType,
      text: input.text,
      createdAt,
      marker: input.marker ?? null,
    };
  }

  compactEventsForAgent(
    agentId: string,
    maxEvents: number,
    targetEvents: number,
  ): { compacted: boolean; summaryEvent: AgentStreamEvent | null } {
    const countRow = this.db.prepare("SELECT COUNT(*) AS c FROM events WHERE agent_id = ?").get(agentId) as { c: number };
    if (countRow.c <= maxEvents) {
      return { compacted: false, summaryEvent: null };
    }
    const removeCount = countRow.c - targetEvents;
    const oldest = this.db
      .prepare(
        `
      SELECT id, seq, event_type, text
      FROM events
      WHERE agent_id = ?
      ORDER BY seq ASC
      LIMIT ?
    `,
      )
      .all(agentId, removeCount) as Array<{ id: number; seq: number; event_type: string; text: string }>;
    if (oldest.length === 0) {
      return { compacted: false, summaryEvent: null };
    }

    const firstSeq = oldest[0]!.seq;
    const lastSeq = oldest[oldest.length - 1]!.seq;
    const preview = oldest
      .slice(0, 6)
      .map((row) => `[${row.event_type}] ${row.text.slice(0, 80)}`)
      .join("\n");
    const summaryText =
      `Compacted ${oldest.length} historical events (seq ${firstSeq}..${lastSeq}).\n` +
      `Preview of compacted window:\n${preview}`;

    let summaryEvent: AgentStreamEvent | null = null;
    this.db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      this.db.prepare("DELETE FROM events WHERE agent_id = ? AND seq <= ?").run(agentId, lastSeq);
      summaryEvent = this.appendEvent({
        agentId,
        eventType: "summary",
        text: summaryText,
        marker: `compact:${lastSeq}`,
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { compacted: true, summaryEvent };
  }

  listEvents(agentId: string, limit = 300): AgentStreamEvent[] {
    const rows = this.db.prepare(
      `
      SELECT id, agent_id, seq, event_type, text, marker, created_at
      FROM events
      WHERE agent_id = ?
      ORDER BY seq DESC
      LIMIT ?
    `,
    ).all(agentId, limit) as unknown as EventDbRow[];
    return rows.reverse().map((row) => ({
      id: String(row.id),
      agentId: row.agent_id,
      seq: row.seq,
      eventType: row.event_type as AgentStreamEvent["eventType"],
      text: row.text,
      marker: row.marker,
      createdAt: row.created_at,
    }));
  }

  createPermissionRequest(input: {
    agentId?: string | null;
    workspaceId?: string | null;
    action: string;
    reason: string;
    payloadJson?: string;
    expiresAt?: string | null;
  }): PermissionRequestRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO permission_requests(
          id, agent_id, workspace_id, action, reason, payload_json, status, decision, requested_at, decided_at, expires_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)`,
      )
      .run(
        id,
        input.agentId ?? null,
        input.workspaceId ?? null,
        input.action,
        input.reason,
        input.payloadJson ?? "{}",
        "pending",
        now,
        input.expiresAt ?? null,
      );
    return this.getPermissionRequestOrThrow(id);
  }

  listPermissionRequests(status?: PermissionStatus): PermissionRequestRecord[] {
    const rows = status
      ? (this.db
          .prepare(
            `SELECT id, agent_id, workspace_id, action, reason, payload_json, status, decision, requested_at, decided_at, expires_at
             FROM permission_requests WHERE status = ? ORDER BY requested_at DESC`,
          )
          .all(status) as unknown as PermissionRequestDbRow[])
      : (this.db
          .prepare(
            `SELECT id, agent_id, workspace_id, action, reason, payload_json, status, decision, requested_at, decided_at, expires_at
             FROM permission_requests ORDER BY requested_at DESC`,
          )
          .all() as unknown as PermissionRequestDbRow[]);
    return rows.map((row) => this.toPermissionRequestRecord(row));
  }

  getPermissionRequest(permissionId: string): PermissionRequestRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, agent_id, workspace_id, action, reason, payload_json, status, decision, requested_at, decided_at, expires_at
         FROM permission_requests WHERE id = ?`,
      )
      .get(permissionId) as PermissionRequestDbRow | undefined;
    return row ? this.toPermissionRequestRecord(row) : null;
  }

  getPermissionRequestOrThrow(permissionId: string): PermissionRequestRecord {
    const permission = this.getPermissionRequest(permissionId);
    if (!permission) {
      throw new Error(`Permission request not found: ${permissionId}`);
    }
    return permission;
  }

  updatePermissionDecision(
    permissionId: string,
    decision: Extract<PermissionStatus, "approved" | "denied">,
    note?: string,
  ): PermissionRequestRecord {
    const now = new Date().toISOString();
    const existing = this.getPermissionRequestOrThrow(permissionId);
    const nextReason = note?.trim().length ? `${existing.reason}\nDecision note: ${note.trim()}` : existing.reason;
    this.db
      .prepare(
        `UPDATE permission_requests
         SET status = ?, decision = ?, decided_at = ?, reason = ?
         WHERE id = ?`,
      )
      .run(decision, decision, now, nextReason, permissionId);
    return this.getPermissionRequestOrThrow(permissionId);
  }

  expirePendingPermissions(nowIso = new Date().toISOString()): PermissionRequestRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, agent_id, workspace_id, action, reason, payload_json, status, decision, requested_at, decided_at, expires_at
         FROM permission_requests
         WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?`,
      )
      .all(nowIso) as unknown as PermissionRequestDbRow[];
    if (rows.length === 0) return [];
    this.db
      .prepare(
        `UPDATE permission_requests
         SET status = 'expired', decision = 'expired', decided_at = ?
         WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?`,
      )
      .run(nowIso, nowIso);
    return rows.map((row) =>
      this.toPermissionRequestRecord({
        ...row,
        status: "expired",
        decision: "expired",
        decided_at: nowIso,
      }),
    );
  }

  createSchedule(input: {
    workspaceId?: string | null;
    agentId?: string | null;
    provider: string;
    cwd: string;
    prompt: string;
    intervalSeconds: number;
    nextRunAt?: string;
  }): ScheduleRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    const nextRunAt = input.nextRunAt ?? new Date(Date.now() + input.intervalSeconds * 1000).toISOString();
    this.db
      .prepare(
        `INSERT INTO schedules(
          id, workspace_id, agent_id, provider, cwd, prompt, interval_seconds, status, next_run_at, last_run_at, last_error, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        input.workspaceId ?? null,
        input.agentId ?? null,
        input.provider,
        input.cwd,
        input.prompt,
        input.intervalSeconds,
        "active",
        nextRunAt,
        now,
        now,
      );
    return this.getScheduleOrThrow(id);
  }

  listSchedules(): ScheduleRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, workspace_id, agent_id, provider, cwd, prompt, interval_seconds, status, next_run_at, last_run_at, last_error, created_at, updated_at
         FROM schedules ORDER BY updated_at DESC`,
      )
      .all() as unknown as ScheduleDbRow[];
    return rows.map((row) => this.toScheduleRecord(row));
  }

  getSchedule(scheduleId: string): ScheduleRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, workspace_id, agent_id, provider, cwd, prompt, interval_seconds, status, next_run_at, last_run_at, last_error, created_at, updated_at
         FROM schedules WHERE id = ?`,
      )
      .get(scheduleId) as ScheduleDbRow | undefined;
    return row ? this.toScheduleRecord(row) : null;
  }

  getScheduleOrThrow(scheduleId: string): ScheduleRecord {
    const schedule = this.getSchedule(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }
    return schedule;
  }

  listDueSchedules(nowIso = new Date().toISOString(), limit = 20): ScheduleRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, workspace_id, agent_id, provider, cwd, prompt, interval_seconds, status, next_run_at, last_run_at, last_error, created_at, updated_at
         FROM schedules
         WHERE status = 'active' AND next_run_at <= ?
         ORDER BY next_run_at ASC
         LIMIT ?`,
      )
      .all(nowIso, limit) as unknown as ScheduleDbRow[];
    return rows.map((row) => this.toScheduleRecord(row));
  }

  setScheduleStatus(scheduleId: string, status: ScheduleStatus, lastError: string | null = null): ScheduleRecord {
    const now = new Date().toISOString();
    const existing = this.getScheduleOrThrow(scheduleId);
    this.db
      .prepare(
        `UPDATE schedules
         SET status = ?, last_error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(status, lastError ?? existing.lastError, now, scheduleId);
    return this.getScheduleOrThrow(scheduleId);
  }

  markScheduleRun(scheduleId: string, input: { success: boolean; error?: string | null }): ScheduleRecord {
    const now = new Date().toISOString();
    const schedule = this.getScheduleOrThrow(scheduleId);
    const nextRunAt = new Date(Date.now() + schedule.intervalSeconds * 1000).toISOString();
    const status: ScheduleStatus = input.success ? "active" : "error";
    this.db
      .prepare(
        `UPDATE schedules
         SET status = ?, next_run_at = ?, last_run_at = ?, last_error = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(status, nextRunAt, now, input.error ?? null, now, scheduleId);
    return this.getScheduleOrThrow(scheduleId);
  }

  deleteSchedule(scheduleId: string): void {
    this.db.prepare("DELETE FROM schedules WHERE id = ?").run(scheduleId);
  }

  createMcpServer(input: {
    name: string;
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
  }): McpServerRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO mcp_servers(
          id, name, command, args_json, cwd, env_json, status, pid, last_error, last_heartbeat_at, created_at, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.command,
        JSON.stringify(input.args ?? []),
        input.cwd ?? process.cwd(),
        JSON.stringify(input.env ?? {}),
        "stopped",
        now,
        now,
      );
    return this.getMcpServerOrThrow(id);
  }

  listMcpServers(): McpServerRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, command, args_json, cwd, env_json, status, pid, last_error, last_heartbeat_at, created_at, updated_at
         FROM mcp_servers ORDER BY updated_at DESC`,
      )
      .all() as unknown as McpServerDbRow[];
    return rows.map((row) => this.toMcpServerRecord(row));
  }

  getMcpServer(serverId: string): McpServerRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, name, command, args_json, cwd, env_json, status, pid, last_error, last_heartbeat_at, created_at, updated_at
         FROM mcp_servers WHERE id = ?`,
      )
      .get(serverId) as McpServerDbRow | undefined;
    return row ? this.toMcpServerRecord(row) : null;
  }

  getMcpServerOrThrow(serverId: string): McpServerRecord {
    const server = this.getMcpServer(serverId);
    if (!server) {
      throw new Error(`MCP server not found: ${serverId}`);
    }
    return server;
  }

  setMcpServerRuntime(
    serverId: string,
    input: {
      status: McpServerStatus;
      pid?: number | null;
      lastError?: string | null;
      heartbeat?: boolean;
    },
  ): McpServerRecord {
    const now = new Date().toISOString();
    const existing = this.getMcpServerOrThrow(serverId);
    this.db
      .prepare(
        `UPDATE mcp_servers
         SET status = ?, pid = ?, last_error = ?, last_heartbeat_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.status,
        input.pid ?? existing.pid,
        input.lastError ?? existing.lastError,
        input.heartbeat ? now : existing.lastHeartbeatAt,
        now,
        serverId,
      );
    return this.getMcpServerOrThrow(serverId);
  }

  deleteMcpServer(serverId: string): void {
    this.db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(serverId);
  }

  createRelaySession(clientName: string): RelaySessionRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO relay_sessions(id, client_name, status, created_at, updated_at, last_seen_at)
         VALUES(?, ?, ?, ?, ?, ?)`,
      )
      .run(id, clientName, "connected", now, now, now);
    return this.getRelaySessionOrThrow(id);
  }

  listRelaySessions(): RelaySessionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, client_name, status, created_at, updated_at, last_seen_at
         FROM relay_sessions ORDER BY updated_at DESC`,
      )
      .all() as unknown as RelaySessionDbRow[];
    return rows.map((row) => this.toRelaySessionRecord(row));
  }

  getRelaySession(relaySessionId: string): RelaySessionRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, client_name, status, created_at, updated_at, last_seen_at
         FROM relay_sessions WHERE id = ?`,
      )
      .get(relaySessionId) as RelaySessionDbRow | undefined;
    return row ? this.toRelaySessionRecord(row) : null;
  }

  getRelaySessionOrThrow(relaySessionId: string): RelaySessionRecord {
    const session = this.getRelaySession(relaySessionId);
    if (!session) {
      throw new Error(`Relay session not found: ${relaySessionId}`);
    }
    return session;
  }

  touchRelaySession(relaySessionId: string): RelaySessionRecord {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE relay_sessions SET updated_at = ?, last_seen_at = ? WHERE id = ?")
      .run(now, now, relaySessionId);
    return this.getRelaySessionOrThrow(relaySessionId);
  }

  closeRelaySession(relaySessionId: string): RelaySessionRecord {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE relay_sessions SET status = ?, updated_at = ?, last_seen_at = ? WHERE id = ?")
      .run("closed", now, now, relaySessionId);
    return this.getRelaySessionOrThrow(relaySessionId);
  }

  createVoiceSession(input: { workspaceId?: string | null; agentId?: string | null }): VoiceSessionRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO voice_sessions(id, workspace_id, agent_id, status, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.workspaceId ?? null, input.agentId ?? null, "active", now, now);
    return this.getVoiceSessionOrThrow(id);
  }

  listVoiceSessions(): VoiceSessionRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, workspace_id, agent_id, status, created_at, updated_at
         FROM voice_sessions ORDER BY updated_at DESC`,
      )
      .all() as unknown as VoiceSessionDbRow[];
    return rows.map((row) => this.toVoiceSessionRecord(row));
  }

  getVoiceSession(voiceSessionId: string): VoiceSessionRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, workspace_id, agent_id, status, created_at, updated_at
         FROM voice_sessions WHERE id = ?`,
      )
      .get(voiceSessionId) as VoiceSessionDbRow | undefined;
    return row ? this.toVoiceSessionRecord(row) : null;
  }

  getVoiceSessionOrThrow(voiceSessionId: string): VoiceSessionRecord {
    const session = this.getVoiceSession(voiceSessionId);
    if (!session) {
      throw new Error(`Voice session not found: ${voiceSessionId}`);
    }
    return session;
  }

  setVoiceSessionStatus(voiceSessionId: string, status: VoiceSessionStatus): VoiceSessionRecord {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE voice_sessions SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, now, voiceSessionId);
    return this.getVoiceSessionOrThrow(voiceSessionId);
  }

  appendVoiceEvent(input: { voiceSessionId: string; role: VoiceChunkEvent["role"]; text: string }): VoiceChunkEvent {
    const createdAt = new Date().toISOString();
    const seq = this.nextVoiceSeq(input.voiceSessionId);
    const inserted = this.db
      .prepare(
        `INSERT INTO voice_events(voice_session_id, seq, role, text, created_at)
         VALUES(?, ?, ?, ?, ?)`,
      )
      .run(input.voiceSessionId, seq, input.role, input.text, createdAt);
    this.db
      .prepare("UPDATE voice_sessions SET updated_at = ? WHERE id = ?")
      .run(createdAt, input.voiceSessionId);
    return {
      id: String(Number(inserted.lastInsertRowid)),
      voiceSessionId: input.voiceSessionId,
      seq,
      role: input.role,
      text: input.text,
      createdAt,
    };
  }

  listVoiceEvents(voiceSessionId: string, limit = 400): VoiceChunkEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, voice_session_id, seq, role, text, created_at
         FROM voice_events
         WHERE voice_session_id = ?
         ORDER BY seq DESC
         LIMIT ?`,
      )
      .all(voiceSessionId, limit) as unknown as VoiceEventDbRow[];
    return rows.reverse().map((row) => ({
      id: String(row.id),
      voiceSessionId: row.voice_session_id,
      seq: row.seq,
      role: row.role as VoiceChunkEvent["role"],
      text: row.text,
      createdAt: row.created_at,
    }));
  }

  private nextSeq(agentId: string): number {
    const row = this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM events WHERE agent_id = ?").get(
      agentId,
    ) as { maxSeq: number | bigint };
    return Number(row.maxSeq) + 1;
  }

  private nextVoiceSeq(voiceSessionId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM voice_events WHERE voice_session_id = ?")
      .get(voiceSessionId) as { maxSeq: number | bigint };
    return Number(row.maxSeq) + 1;
  }

  private toAgentRecord(row: AgentDbRow): AgentRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      parentAgentId: row.parent_agent_id,
      provider: row.provider,
      cwd: row.cwd,
      title: row.title,
      model: row.model,
      status: row.status as AgentStatus,
      mode: row.mode as AgentMode,
      permissionMode: row.permission_mode as PermissionMode,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.last_activity_at,
      archivedAt: row.archived_at,
      sessionId: row.session_id,
      cursorMarker: row.cursor_marker,
      lastError: row.last_error,
    };
  }

  private toProjectRecord(row: ProjectDbRow): ProjectRecord {
    return {
      id: row.id,
      name: row.name,
      rootPath: row.root_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toWorkspaceRecord(row: WorkspaceDbRow): WorkspaceRecord {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      rootPath: row.root_path,
      kind: row.kind as WorkspaceKind,
      branch: row.branch,
      status: row.status as WorkspaceStatus,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toPermissionRequestRecord(row: PermissionRequestDbRow): PermissionRequestRecord {
    return {
      id: row.id,
      agentId: row.agent_id,
      workspaceId: row.workspace_id,
      action: row.action,
      reason: row.reason,
      payloadJson: row.payload_json,
      status: row.status as PermissionStatus,
      decision: row.decision,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      expiresAt: row.expires_at,
    };
  }

  private toScheduleRecord(row: ScheduleDbRow): ScheduleRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      agentId: row.agent_id,
      provider: row.provider,
      cwd: row.cwd,
      prompt: row.prompt,
      intervalSeconds: row.interval_seconds,
      status: row.status as ScheduleStatus,
      nextRunAt: row.next_run_at,
      lastRunAt: row.last_run_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toMcpServerRecord(row: McpServerDbRow): McpServerRecord {
    return {
      id: row.id,
      name: row.name,
      command: row.command,
      argsJson: row.args_json,
      cwd: row.cwd,
      envJson: row.env_json,
      status: row.status as McpServerStatus,
      pid: row.pid,
      lastError: row.last_error,
      lastHeartbeatAt: row.last_heartbeat_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toRelaySessionRecord(row: RelaySessionDbRow): RelaySessionRecord {
    return {
      id: row.id,
      clientName: row.client_name,
      status: row.status as RelaySessionStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
    };
  }

  private toVoiceSessionRecord(row: VoiceSessionDbRow): VoiceSessionRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      agentId: row.agent_id,
      status: row.status as VoiceSessionStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface AgentDbRow {
  id: string;
  workspace_id: string | null;
  parent_agent_id: string | null;
  provider: string;
  cwd: string;
  title: string | null;
  model: string | null;
  status: string;
  mode: string;
  permission_mode: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  archived_at: string | null;
  session_id: string | null;
  cursor_marker: string | null;
  last_error: string | null;
}

interface ProjectDbRow {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
  updated_at: string;
}

interface WorkspaceDbRow {
  id: string;
  project_id: string;
  name: string;
  root_path: string;
  kind: string;
  branch: string | null;
  status: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EventDbRow {
  id: number;
  agent_id: string;
  seq: number;
  event_type: string;
  text: string;
  marker: string | null;
  created_at: string;
}

interface PermissionRequestDbRow {
  id: string;
  agent_id: string | null;
  workspace_id: string | null;
  action: string;
  reason: string;
  payload_json: string;
  status: string;
  decision: string | null;
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
}

interface ScheduleDbRow {
  id: string;
  workspace_id: string | null;
  agent_id: string | null;
  provider: string;
  cwd: string;
  prompt: string;
  interval_seconds: number;
  status: string;
  next_run_at: string;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface McpServerDbRow {
  id: string;
  name: string;
  command: string;
  args_json: string;
  cwd: string;
  env_json: string;
  status: string;
  pid: number | null;
  last_error: string | null;
  last_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RelaySessionDbRow {
  id: string;
  client_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

interface VoiceSessionDbRow {
  id: string;
  workspace_id: string | null;
  agent_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface VoiceEventDbRow {
  id: number;
  voice_session_id: string;
  seq: number;
  role: string;
  text: string;
  created_at: string;
}

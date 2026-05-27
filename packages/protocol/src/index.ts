import { z } from "zod";

export const SUPPORTED_PROVIDERS = ["codex", "claude", "opencode"] as const;
export type SupportedProviderId = (typeof SUPPORTED_PROVIDERS)[number];

export const AgentStatusSchema = z.enum(["initializing", "running", "idle", "error", "stopped", "archived"]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentModeSchema = z.enum(["chat", "plan", "auto"]);
export type AgentMode = z.infer<typeof AgentModeSchema>;

export const PermissionModeSchema = z.enum(["allow", "ask", "deny"]);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

export const PermissionStatusSchema = z.enum(["pending", "approved", "denied", "expired"]);
export type PermissionStatus = z.infer<typeof PermissionStatusSchema>;

export const WorkspaceKindSchema = z.enum(["main", "worktree"]);
export type WorkspaceKind = z.infer<typeof WorkspaceKindSchema>;

export const WorkspaceStatusSchema = z.enum(["active", "archived"]);
export type WorkspaceStatus = z.infer<typeof WorkspaceStatusSchema>;

export const TerminalStatusSchema = z.enum(["running", "stopped"]);
export type TerminalStatus = z.infer<typeof TerminalStatusSchema>;

export const ScheduleStatusSchema = z.enum(["active", "paused", "error"]);
export type ScheduleStatus = z.infer<typeof ScheduleStatusSchema>;

export const McpServerStatusSchema = z.enum(["stopped", "starting", "running", "error"]);
export type McpServerStatus = z.infer<typeof McpServerStatusSchema>;

export const RelaySessionStatusSchema = z.enum(["connected", "closed"]);
export type RelaySessionStatus = z.infer<typeof RelaySessionStatusSchema>;

export const VoiceSessionStatusSchema = z.enum(["active", "ended"]);
export type VoiceSessionStatus = z.infer<typeof VoiceSessionStatusSchema>;

export const PairingOfferSchema = z.object({
  v: z.literal(1),
  serverId: z.string().min(1),
  wsEndpoint: z.string().min(1),
  pairingToken: z.string().min(1),
  expiresAt: z.string().datetime(),
});
export type PairingOffer = z.infer<typeof PairingOfferSchema>;

export function encodePairingOfferFragment(offer: PairingOffer): string {
  const json = JSON.stringify(offer);
  const NodeBuffer = (globalThis as {
    Buffer?: {
      from(input: string, encoding?: string): { toString(encoding?: string): string };
    };
  }).Buffer;
  if (NodeBuffer) {
    return NodeBuffer.from(json, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodePairingOfferFragment(fragmentPayload: string): PairingOffer {
  const base64 = fragmentPayload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const NodeBuffer = (globalThis as {
    Buffer?: {
      from(input: string, encoding?: string): { toString(encoding?: string): string };
    };
  }).Buffer;
  const decoded =
    NodeBuffer
      ? NodeBuffer.from(padded, "base64").toString("utf8")
      : (() => {
          const binary = atob(padded);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
          }
          return new TextDecoder().decode(bytes);
        })();
  const parsed = JSON.parse(decoded);
  return PairingOfferSchema.parse(parsed);
}

export interface AgentRecord {
  id: string;
  workspaceId: string | null;
  parentAgentId: string | null;
  provider: string;
  cwd: string;
  title: string | null;
  model: string | null;
  status: AgentStatus;
  mode: AgentMode;
  permissionMode: PermissionMode;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  archivedAt: string | null;
  sessionId: string | null;
  cursorMarker: string | null;
  lastError: string | null;
}

export interface ProjectRecord {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceRecord {
  id: string;
  projectId: string;
  name: string;
  rootPath: string;
  kind: WorkspaceKind;
  branch: string | null;
  status: WorkspaceStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalRecord {
  id: string;
  workspaceId: string | null;
  cwd: string;
  command: string;
  status: TerminalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionRequestRecord {
  id: string;
  agentId: string | null;
  workspaceId: string | null;
  action: string;
  reason: string;
  payloadJson: string;
  status: PermissionStatus;
  decision: string | null;
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
}

export interface ScheduleRecord {
  id: string;
  workspaceId: string | null;
  agentId: string | null;
  provider: string;
  cwd: string;
  prompt: string;
  intervalSeconds: number;
  status: ScheduleStatus;
  nextRunAt: string;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpServerRecord {
  id: string;
  name: string;
  command: string;
  argsJson: string;
  cwd: string;
  envJson: string;
  status: McpServerStatus;
  pid: number | null;
  lastError: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RelaySessionRecord {
  id: string;
  clientName: string;
  status: RelaySessionStatus;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface VoiceSessionRecord {
  id: string;
  workspaceId: string | null;
  agentId: string | null;
  status: VoiceSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export const AgentRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().nullable(),
  parentAgentId: z.string().nullable(),
  provider: z.string().min(1),
  cwd: z.string().min(1),
  title: z.string().nullable(),
  model: z.string().nullable(),
  status: AgentStatusSchema,
  mode: AgentModeSchema,
  permissionMode: PermissionModeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  sessionId: z.string().nullable(),
  cursorMarker: z.string().nullable(),
  lastError: z.string().nullable(),
});

export const ProjectRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const WorkspaceRecordSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  kind: WorkspaceKindSchema,
  branch: z.string().nullable(),
  status: WorkspaceStatusSchema,
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TerminalRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().nullable(),
  cwd: z.string().min(1),
  command: z.string().min(1),
  status: TerminalStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const PermissionRequestRecordSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  action: z.string().min(1),
  reason: z.string().min(1),
  payloadJson: z.string(),
  status: PermissionStatusSchema,
  decision: z.string().nullable(),
  requestedAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
});

export const ScheduleRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().nullable(),
  agentId: z.string().nullable(),
  provider: z.string().min(1),
  cwd: z.string().min(1),
  prompt: z.string().min(1),
  intervalSeconds: z.number().int().positive(),
  status: ScheduleStatusSchema,
  nextRunAt: z.string().datetime(),
  lastRunAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const McpServerRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  command: z.string().min(1),
  argsJson: z.string(),
  cwd: z.string().min(1),
  envJson: z.string(),
  status: McpServerStatusSchema,
  pid: z.number().int().nullable(),
  lastError: z.string().nullable(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const RelaySessionRecordSchema = z.object({
  id: z.string().min(1),
  clientName: z.string().min(1),
  status: RelaySessionStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});

export const VoiceSessionRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().nullable(),
  agentId: z.string().nullable(),
  status: VoiceSessionStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TerminalOutputEventSchema = z.object({
  terminalId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  stream: z.enum(["stdout", "stderr", "system"]),
  encoding: z.enum(["utf8", "base64"]),
  byteLength: z.number().int().nonnegative(),
  chunk: z.string().default(""),
  createdAt: z.string().datetime(),
});
export type TerminalOutputEvent = z.infer<typeof TerminalOutputEventSchema>;

export const AgentStreamEventSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  eventType: z.enum(["assistant_text", "stderr_text", "system_status", "summary"]),
  text: z.string(),
  createdAt: z.string().datetime(),
  marker: z.string().nullable().optional(),
});
export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;

export const VoiceChunkEventSchema = z.object({
  id: z.string().min(1),
  voiceSessionId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  role: z.enum(["user", "assistant", "system"]),
  text: z.string(),
  createdAt: z.string().datetime(),
});
export type VoiceChunkEvent = z.infer<typeof VoiceChunkEventSchema>;

export const HelloPayloadSchema = z.object({
  authToken: z.string().min(1),
  clientName: z.string().min(1).optional(),
});

export const WelcomePayloadSchema = z.object({
  serverId: z.string().min(1),
  now: z.string().datetime(),
  agents: z.array(AgentRecordSchema),
  projects: z.array(ProjectRecordSchema),
  workspaces: z.array(WorkspaceRecordSchema),
  terminals: z.array(TerminalRecordSchema),
  permissions: z.array(PermissionRequestRecordSchema),
  schedules: z.array(ScheduleRecordSchema),
  mcpServers: z.array(McpServerRecordSchema),
  relaySessions: z.array(RelaySessionRecordSchema),
  voiceSessions: z.array(VoiceSessionRecordSchema),
});

export const AgentCreatePayloadSchema = z.object({
  provider: z.string().min(1),
  cwd: z.string().min(1),
  prompt: z.string().optional(),
  title: z.string().optional(),
  model: z.string().optional(),
  workspaceId: z.string().optional(),
  parentAgentId: z.string().optional(),
  mode: AgentModeSchema.optional(),
  permissionMode: PermissionModeSchema.optional(),
});

export const AgentUpdatePayloadSchema = z.object({
  agent: AgentRecordSchema,
});

export const AgentStreamPayloadSchema = z.object({
  agentId: z.string().min(1),
  event: AgentStreamEventSchema,
});

export const AgentSendPayloadSchema = z.object({
  agentId: z.string().min(1),
  prompt: z.string().min(1),
});

export const AgentStopPayloadSchema = z.object({
  agentId: z.string().min(1),
});

export const AgentArchivePayloadSchema = z.object({
  agentId: z.string().min(1),
});

export const AgentSetModePayloadSchema = z.object({
  agentId: z.string().min(1),
  mode: AgentModeSchema.optional(),
  permissionMode: PermissionModeSchema.optional(),
});

export const ProjectCreatePayloadSchema = z.object({
  name: z.string().min(1),
  rootPath: z.string().min(1),
});

export const ProjectUpdatePayloadSchema = z.object({
  project: ProjectRecordSchema,
});

export const WorkspaceCreatePayloadSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  kind: WorkspaceKindSchema.default("worktree"),
  branch: z.string().min(1).optional(),
});

export const WorkspaceUpdatePayloadSchema = z.object({
  workspace: WorkspaceRecordSchema,
});

export const TerminalCreatePayloadSchema = z.object({
  workspaceId: z.string().optional(),
  cwd: z.string().optional(),
  command: z.string().optional(),
});

export const TerminalUpdatePayloadSchema = z.object({
  terminal: TerminalRecordSchema,
});

export const TerminalOutputPayloadSchema = z.object({
  event: TerminalOutputEventSchema,
});

export const TerminalInputPayloadSchema = z.object({
  terminalId: z.string().min(1),
  input: z.string(),
});

export const TerminalKillPayloadSchema = z.object({
  terminalId: z.string().min(1),
});

export const PermissionRequestCreatePayloadSchema = z.object({
  agentId: z.string().optional(),
  workspaceId: z.string().optional(),
  action: z.string().min(1),
  reason: z.string().min(1),
  payloadJson: z.string().default("{}"),
  expiresInSeconds: z.number().int().positive().optional(),
});

export const PermissionRequestUpdatePayloadSchema = z.object({
  permission: PermissionRequestRecordSchema,
});

export const PermissionDecisionPayloadSchema = z.object({
  permissionId: z.string().min(1),
  decision: z.enum(["approved", "denied"]),
  note: z.string().optional(),
});

export const ScheduleCreatePayloadSchema = z.object({
  workspaceId: z.string().optional(),
  agentId: z.string().optional(),
  provider: z.string().min(1),
  cwd: z.string().min(1),
  prompt: z.string().min(1),
  intervalSeconds: z.number().int().positive(),
});

export const ScheduleUpdatePayloadSchema = z.object({
  schedule: ScheduleRecordSchema,
});

export const ScheduleControlPayloadSchema = z.object({
  scheduleId: z.string().min(1),
});

export const McpServerRegisterPayloadSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
});

export const McpServerUpdatePayloadSchema = z.object({
  server: McpServerRecordSchema,
});

export const McpServerControlPayloadSchema = z.object({
  serverId: z.string().min(1),
});

export const RelaySessionUpdatePayloadSchema = z.object({
  relaySession: RelaySessionRecordSchema,
});

export const VoiceSessionCreatePayloadSchema = z.object({
  workspaceId: z.string().optional(),
  agentId: z.string().optional(),
});

export const VoiceSessionUpdatePayloadSchema = z.object({
  voiceSession: VoiceSessionRecordSchema,
});

export const VoiceChunkPayloadSchema = z.object({
  event: VoiceChunkEventSchema,
});

export const VoiceChunkInputPayloadSchema = z.object({
  voiceSessionId: z.string().min(1),
  text: z.string(),
  sendToAgent: z.boolean().optional(),
});

export const ErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.string().optional(),
  requestId: z.string().optional(),
});

const BaseEnvelopeSchema = z.object({
  type: z.enum([
    "hello",
    "welcome",
    "agent_create",
    "agent_update",
    "agent_stream",
    "agent_send",
    "agent_stop",
    "agent_archive",
    "agent_set_mode",
    "project_create",
    "project_update",
    "workspace_create",
    "workspace_update",
    "terminal_create",
    "terminal_update",
    "terminal_output",
    "terminal_input",
    "terminal_kill",
    "permission_create",
    "permission_update",
    "permission_decide",
    "schedule_create",
    "schedule_update",
    "schedule_pause",
    "schedule_resume",
    "schedule_run_now",
    "mcp_server_register",
    "mcp_server_update",
    "mcp_server_start",
    "mcp_server_stop",
    "mcp_server_remove",
    "relay_session_update",
    "voice_session_create",
    "voice_session_update",
    "voice_chunk",
    "voice_chunk_input",
    "error",
  ]),
  requestId: z.string().optional(),
  payload: z.unknown(),
});

export type MessageType = z.infer<typeof BaseEnvelopeSchema>["type"];

export interface WsEnvelope<TType extends MessageType = MessageType, TPayload = object> {
  type: TType;
  requestId?: string;
  payload: TPayload;
}

export function parseEnvelope(input: unknown): WsEnvelope {
  const envelope = BaseEnvelopeSchema.parse(input);
  switch (envelope.type) {
    case "hello":
      return { ...envelope, payload: HelloPayloadSchema.parse(envelope.payload) };
    case "welcome":
      return { ...envelope, payload: WelcomePayloadSchema.parse(envelope.payload) };
    case "agent_create":
      return { ...envelope, payload: AgentCreatePayloadSchema.parse(envelope.payload) };
    case "agent_update":
      return { ...envelope, payload: AgentUpdatePayloadSchema.parse(envelope.payload) };
    case "agent_stream":
      return { ...envelope, payload: AgentStreamPayloadSchema.parse(envelope.payload) };
    case "agent_send":
      return { ...envelope, payload: AgentSendPayloadSchema.parse(envelope.payload) };
    case "agent_stop":
      return { ...envelope, payload: AgentStopPayloadSchema.parse(envelope.payload) };
    case "agent_archive":
      return { ...envelope, payload: AgentArchivePayloadSchema.parse(envelope.payload) };
    case "agent_set_mode":
      return { ...envelope, payload: AgentSetModePayloadSchema.parse(envelope.payload) };
    case "project_create":
      return { ...envelope, payload: ProjectCreatePayloadSchema.parse(envelope.payload) };
    case "project_update":
      return { ...envelope, payload: ProjectUpdatePayloadSchema.parse(envelope.payload) };
    case "workspace_create":
      return { ...envelope, payload: WorkspaceCreatePayloadSchema.parse(envelope.payload) };
    case "workspace_update":
      return { ...envelope, payload: WorkspaceUpdatePayloadSchema.parse(envelope.payload) };
    case "terminal_create":
      return { ...envelope, payload: TerminalCreatePayloadSchema.parse(envelope.payload) };
    case "terminal_update":
      return { ...envelope, payload: TerminalUpdatePayloadSchema.parse(envelope.payload) };
    case "terminal_output":
      return { ...envelope, payload: TerminalOutputPayloadSchema.parse(envelope.payload) };
    case "terminal_input":
      return { ...envelope, payload: TerminalInputPayloadSchema.parse(envelope.payload) };
    case "terminal_kill":
      return { ...envelope, payload: TerminalKillPayloadSchema.parse(envelope.payload) };
    case "permission_create":
      return { ...envelope, payload: PermissionRequestCreatePayloadSchema.parse(envelope.payload) };
    case "permission_update":
      return { ...envelope, payload: PermissionRequestUpdatePayloadSchema.parse(envelope.payload) };
    case "permission_decide":
      return { ...envelope, payload: PermissionDecisionPayloadSchema.parse(envelope.payload) };
    case "schedule_create":
      return { ...envelope, payload: ScheduleCreatePayloadSchema.parse(envelope.payload) };
    case "schedule_update":
      return { ...envelope, payload: ScheduleUpdatePayloadSchema.parse(envelope.payload) };
    case "schedule_pause":
      return { ...envelope, payload: ScheduleControlPayloadSchema.parse(envelope.payload) };
    case "schedule_resume":
      return { ...envelope, payload: ScheduleControlPayloadSchema.parse(envelope.payload) };
    case "schedule_run_now":
      return { ...envelope, payload: ScheduleControlPayloadSchema.parse(envelope.payload) };
    case "mcp_server_register":
      return { ...envelope, payload: McpServerRegisterPayloadSchema.parse(envelope.payload) };
    case "mcp_server_update":
      return { ...envelope, payload: McpServerUpdatePayloadSchema.parse(envelope.payload) };
    case "mcp_server_start":
      return { ...envelope, payload: McpServerControlPayloadSchema.parse(envelope.payload) };
    case "mcp_server_stop":
      return { ...envelope, payload: McpServerControlPayloadSchema.parse(envelope.payload) };
    case "mcp_server_remove":
      return { ...envelope, payload: McpServerControlPayloadSchema.parse(envelope.payload) };
    case "relay_session_update":
      return { ...envelope, payload: RelaySessionUpdatePayloadSchema.parse(envelope.payload) };
    case "voice_session_create":
      return { ...envelope, payload: VoiceSessionCreatePayloadSchema.parse(envelope.payload) };
    case "voice_session_update":
      return { ...envelope, payload: VoiceSessionUpdatePayloadSchema.parse(envelope.payload) };
    case "voice_chunk":
      return { ...envelope, payload: VoiceChunkPayloadSchema.parse(envelope.payload) };
    case "voice_chunk_input":
      return { ...envelope, payload: VoiceChunkInputPayloadSchema.parse(envelope.payload) };
    case "error":
      return { ...envelope, payload: ErrorPayloadSchema.parse(envelope.payload) };
    default: {
      const neverType: never = envelope.type;
      throw new Error(`Unknown envelope type: ${neverType}`);
    }
  }
}

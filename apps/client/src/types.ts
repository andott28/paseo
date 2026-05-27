import type {
  AgentRecord,
  AgentStreamEvent,
  McpServerRecord,
  PermissionRequestRecord,
  ProjectRecord,
  RelaySessionRecord,
  ScheduleRecord,
  TerminalOutputEvent,
  TerminalRecord,
  VoiceChunkEvent,
  VoiceSessionRecord,
  WorkspaceRecord,
} from "@gaa/protocol";

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface ClientSession {
  serverId: string;
  authToken: string;
  wsEndpoint: string;
  httpBaseUrl: string;
}

export type AgentMap = Record<string, AgentRecord>;
export type EventMap = Record<string, AgentStreamEvent[]>;
export type ProjectMap = Record<string, ProjectRecord>;
export type WorkspaceMap = Record<string, WorkspaceRecord>;
export type TerminalMap = Record<string, TerminalRecord>;
export type TerminalOutputMap = Record<string, TerminalOutputEvent[]>;
export type PermissionMap = Record<string, PermissionRequestRecord>;
export type ScheduleMap = Record<string, ScheduleRecord>;
export type McpServerMap = Record<string, McpServerRecord>;
export type RelaySessionMap = Record<string, RelaySessionRecord>;
export type VoiceSessionMap = Record<string, VoiceSessionRecord>;
export type VoiceEventMap = Record<string, VoiceChunkEvent[]>;

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentManager } from "../agent-manager.js";
import type { AppConfig } from "../config.js";
import type { DatabaseService } from "../db.js";
import type { McpManager } from "../mcp-manager.js";
import type { PermissionGate } from "../permission-gate.js";
import type { RelayManager } from "../relay-manager.js";
import type { ScheduleService } from "../schedule-service.js";
import type { TerminalManager } from "../terminal-manager.js";
import type { VoiceManager } from "../voice-manager.js";
import type { WsHub } from "../ws-hub.js";

export type RouteContext = {
  config: AppConfig;
  serverId: string;
  db: DatabaseService;
  manager: AgentManager;
  hub: WsHub;
  terminalManager: TerminalManager;
  scheduleService: ScheduleService;
  mcpManager: McpManager;
  relayManager: RelayManager;
  voiceManager: VoiceManager;
  permissionGate: PermissionGate;
  providers: { getAvailabilitySnapshot(): Promise<unknown> };
  createPermissionRequest: (input: {
    agentId?: string;
    workspaceId?: string;
    action: string;
    reason: string;
    payloadJson?: string;
    expiresInSeconds?: number;
  }) => any;
  decidePermission: (permissionId: string, decision: "approved" | "denied", note?: string) => Promise<any>;
};

export type RouteHandlerInput = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  path: string;
  authToken: string;
};

export type RouteHandler = (input: RouteHandlerInput) => Promise<boolean>;

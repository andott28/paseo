import type {
  McpServerRecord,
  PermissionRequestRecord,
  RelaySessionRecord,
  ScheduleRecord,
  VoiceChunkEvent,
  VoiceSessionRecord,
  WsEnvelope,
} from "@gaa/protocol";
import { apiJson, authHeaders } from "../client/daemon-cli-client.js";
import { loadSession } from "../session/session-store.js";
import type { CommandRegistry } from "./types.js";

async function listPermissions(status?: string): Promise<void> {
  const session = await loadSession();
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const body = await apiJson(session.httpBaseUrl + `/permissions${query}`, { headers: authHeaders(session) });
  const permissions = body.permissions as PermissionRequestRecord[];
  for (const permission of permissions) {
    process.stdout.write(`${permission.id}\t${permission.status}\t${permission.action}\tagent=${permission.agentId ?? "-"}\n`);
  }
}

async function approvePermission(permissionId: string, note?: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + `/permissions/${permissionId}/approve`, {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ note }),
  });
  const permission = body.permission as PermissionRequestRecord;
  process.stdout.write(`permission ${permission.id} approved\n`);
}

async function denyPermission(permissionId: string, note?: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + `/permissions/${permissionId}/deny`, {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ note }),
  });
  const permission = body.permission as PermissionRequestRecord;
  process.stdout.write(`permission ${permission.id} denied\n`);
}

async function listSchedules(): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/schedules", { headers: authHeaders(session) });
  const schedules = body.schedules as ScheduleRecord[];
  for (const schedule of schedules) {
    process.stdout.write(`${schedule.id}\t${schedule.status}\t${schedule.intervalSeconds}s\t${schedule.provider}\t${schedule.cwd}\n`);
  }
}

async function addSchedule(provider: string, cwd: string, intervalSeconds: number, prompt: string, workspaceId?: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/schedules", {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ provider, cwd, intervalSeconds, prompt, workspaceId }),
  });
  const schedule = body.schedule as ScheduleRecord;
  process.stdout.write(`schedule ${schedule.id} created\n`);
}

async function schedulePause(scheduleId: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/schedules/${scheduleId}/pause`, { method: "POST", headers: authHeaders(session) });
  process.stdout.write(`schedule ${scheduleId} paused\n`);
}

async function scheduleResume(scheduleId: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/schedules/${scheduleId}/resume`, { method: "POST", headers: authHeaders(session) });
  process.stdout.write(`schedule ${scheduleId} resumed\n`);
}

async function scheduleRun(scheduleId: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/schedules/${scheduleId}/run`, { method: "POST", headers: authHeaders(session) });
  process.stdout.write(`schedule ${scheduleId} triggered\n`);
}

async function scheduleDelete(scheduleId: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/schedules/${scheduleId}`, { method: "DELETE", headers: authHeaders(session) });
  process.stdout.write(`schedule ${scheduleId} deleted\n`);
}

async function listMcpServers(): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/mcp/servers", { headers: authHeaders(session) });
  const servers = body.servers as McpServerRecord[];
  for (const server of servers) process.stdout.write(`${server.id}\t${server.name}\t${server.status}\t${server.command}\n`);
}

async function addMcpServer(name: string, command: string, args: string[]): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/mcp/servers", {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ name, command, args }),
  });
  const server = body.server as McpServerRecord;
  process.stdout.write(`mcp server ${server.id} created\n`);
}

async function mcpStart(serverId: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/mcp/servers/${serverId}/start`, { method: "POST", headers: authHeaders(session) });
  process.stdout.write(`mcp server ${serverId} started\n`);
}

async function mcpStop(serverId: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/mcp/servers/${serverId}/stop`, { method: "POST", headers: authHeaders(session) });
  process.stdout.write(`mcp server ${serverId} stopped\n`);
}

async function mcpRemove(serverId: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/mcp/servers/${serverId}`, { method: "DELETE", headers: authHeaders(session) });
  process.stdout.write(`mcp server ${serverId} removed\n`);
}

async function relayOpen(clientName?: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/relay/sessions", {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ clientName }),
  });
  const relaySession = body.relaySession as RelaySessionRecord;
  process.stdout.write(`${relaySession.id}\n`);
}

async function relayList(): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/relay/sessions", { headers: authHeaders(session) });
  const sessions = body.relaySessions as RelaySessionRecord[];
  for (const relaySession of sessions) process.stdout.write(`${relaySession.id}\t${relaySession.status}\t${relaySession.clientName}\n`);
}

async function relayPoll(relaySessionId: string, timeoutMs = 10000): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + `/relay/sessions/${relaySessionId}/poll?timeoutMs=${timeoutMs}&limit=400`, {
    headers: authHeaders(session),
  });
  const messages = body.messages as WsEnvelope[];
  process.stdout.write(JSON.stringify(messages, null, 2) + "\n");
}

async function relaySend(relaySessionId: string, envelopeJson: string): Promise<void> {
  const session = await loadSession();
  const envelope = JSON.parse(envelopeJson) as WsEnvelope;
  await apiJson(session.httpBaseUrl + `/relay/sessions/${relaySessionId}/send`, {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ envelope }),
  });
  process.stdout.write("relay command sent\n");
}

async function relayClose(relaySessionId: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/relay/sessions/${relaySessionId}`, { method: "DELETE", headers: authHeaders(session) });
  process.stdout.write(`relay session ${relaySessionId} closed\n`);
}

async function listVoiceSessions(): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/voice/sessions", { headers: authHeaders(session) });
  const sessions = body.voiceSessions as VoiceSessionRecord[];
  for (const voiceSession of sessions) process.stdout.write(`${voiceSession.id}\t${voiceSession.status}\tagent=${voiceSession.agentId ?? "-"}\n`);
}

async function voiceStart(agentId?: string, workspaceId?: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/voice/sessions", {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ agentId, workspaceId }),
  });
  const voiceSession = body.voiceSession as VoiceSessionRecord;
  process.stdout.write(`${voiceSession.id}\n`);
}

async function voiceChunk(voiceSessionId: string, text: string, sendToAgent: boolean): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/voice/sessions/${voiceSessionId}/chunk`, {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ text, sendToAgent }),
  });
  process.stdout.write("voice chunk sent\n");
}

async function voiceEvents(voiceSessionId: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + `/voice/sessions/${voiceSessionId}/events?limit=500`, { headers: authHeaders(session) });
  const events = body.events as VoiceChunkEvent[];
  for (const event of events) process.stdout.write(`#${event.seq} ${event.role}: ${event.text}\n`);
}

async function voiceEnd(voiceSessionId: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/voice/sessions/${voiceSessionId}/end`, { method: "POST", headers: authHeaders(session) });
  process.stdout.write("voice session ended\n");
}

export const opsCommands: CommandRegistry = {
  permissions: async (args) => listPermissions(args[0]),
  approve: async (args) => approvePermission(args[0] ?? "", args.slice(1).join(" ").trim() || undefined),
  deny: async (args) => denyPermission(args[0] ?? "", args.slice(1).join(" ").trim() || undefined),
  schedules: async () => listSchedules(),
  "schedule-add": async (args) => addSchedule(args[0] ?? "codex", args[1] ?? process.cwd(), Number(args[2] ?? "0"), args[3] ?? "", args[4]),
  "schedule-pause": async (args) => schedulePause(args[0] ?? ""),
  "schedule-resume": async (args) => scheduleResume(args[0] ?? ""),
  "schedule-run": async (args) => scheduleRun(args[0] ?? ""),
  "schedule-delete": async (args) => scheduleDelete(args[0] ?? ""),
  "mcp-servers": async () => listMcpServers(),
  "mcp-add": async (args) => addMcpServer(args[0] ?? "", args[1] ?? "", args.slice(2)),
  "mcp-start": async (args) => mcpStart(args[0] ?? ""),
  "mcp-stop": async (args) => mcpStop(args[0] ?? ""),
  "mcp-remove": async (args) => mcpRemove(args[0] ?? ""),
  "relay-open": async (args) => relayOpen(args[0]),
  "relay-list": async () => relayList(),
  "relay-poll": async (args) => relayPoll(args[0] ?? "", Number(args[1] ?? "10000")),
  "relay-send": async (args) => relaySend(args[0] ?? "", args.slice(1).join(" ")),
  "relay-close": async (args) => relayClose(args[0] ?? ""),
  "voice-sessions": async () => listVoiceSessions(),
  "voice-start": async (args) => voiceStart(args[0], args[1]),
  "voice-chunk": async (args) => voiceChunk(args[0] ?? "", args[1] ?? "", args.includes("--send")),
  "voice-events": async (args) => voiceEvents(args[0] ?? ""),
  "voice-end": async (args) => voiceEnd(args[0] ?? ""),
};

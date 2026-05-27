import type { AgentRecord, AgentStreamEvent, WorkspaceRecord } from "@gaa/protocol";
import { apiJson, authHeaders, sendWs } from "../client/daemon-cli-client.js";
import { loadSession } from "../session/session-store.js";
import type { CommandRegistry } from "./types.js";

async function listAgents(): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/agents", { headers: authHeaders(session) });
  const agents = body.agents as AgentRecord[];
  for (const agent of agents) {
    process.stdout.write(
      `${agent.id}\t${agent.provider}\t${agent.status}\tmode=${agent.mode}\tperm=${agent.permissionMode}\tworkspace=${agent.workspaceId ?? "-"}\n`,
    );
  }
}

async function logs(agentId: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + `/agents/${agentId}/events?limit=400`, { headers: authHeaders(session) });
  const events = body.events as AgentStreamEvent[];
  for (const event of events) process.stdout.write(`#${event.seq} ${event.eventType}: ${event.text}\n`);
}

async function listSubagents(agentId: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + `/agents/${agentId}/subagents`, { headers: authHeaders(session) });
  const agents = body.agents as AgentRecord[];
  for (const agent of agents) process.stdout.write(`${agent.id}\t${agent.provider}\t${agent.status}\tparent=${agent.parentAgentId ?? "-"}\n`);
}

async function setAgentMode(agentId: string, mode?: string, permissionMode?: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + `/agents/${agentId}/mode`, {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ mode, permissionMode }),
  });
  const agent = body.agent as AgentRecord;
  process.stdout.write(`agent ${agent.id} mode=${agent.mode} permissionMode=${agent.permissionMode}\n`);
}

async function runAgent(
  provider: string,
  cwd: string,
  prompt: string,
  mode?: "chat" | "plan" | "auto",
  permissionMode?: "allow" | "ask" | "deny",
): Promise<void> {
  const session = await loadSession();
  await sendWs(session, {
    type: "agent_create",
    requestId: "cli_create",
    payload: { provider, cwd, prompt, mode, permissionMode },
  });
  process.stdout.write("agent_create sent\n");
}

async function runAgentInWorkspace(provider: string, workspaceId: string, prompt: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + `/workspaces/${workspaceId}`, { headers: authHeaders(session) });
  const workspace = body.workspace as WorkspaceRecord;
  await sendWs(session, {
    type: "agent_create",
    requestId: "cli_create_workspace",
    payload: { provider, workspaceId, cwd: workspace.rootPath, prompt },
  });
  process.stdout.write(`agent_create sent for workspace ${workspace.id}\n`);
}

async function spawnSubagent(parentAgentId: string, provider: string, prompt: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + `/agents/${parentAgentId}/subagents`, {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ provider, prompt }),
  });
  const agent = body.agent as AgentRecord;
  process.stdout.write(`subagent ${agent.id} created\n`);
}

async function sendPrompt(agentId: string, prompt: string): Promise<void> {
  const session = await loadSession();
  await sendWs(session, { type: "agent_send", requestId: "cli_send", payload: { agentId, prompt } });
  process.stdout.write("agent_send sent\n");
}

async function stopAgent(agentId: string): Promise<void> {
  const session = await loadSession();
  await sendWs(session, { type: "agent_stop", requestId: "cli_stop", payload: { agentId } });
  process.stdout.write("agent_stop sent\n");
}

async function archiveAgent(agentId: string): Promise<void> {
  const session = await loadSession();
  await sendWs(session, { type: "agent_archive", requestId: "cli_archive", payload: { agentId } });
  process.stdout.write("agent_archive sent\n");
}

export const agentCommands: CommandRegistry = {
  ls: async () => listAgents(),
  logs: async (args) => logs(args[0] ?? ""),
  subagents: async (args) => listSubagents(args[0] ?? ""),
  spawn: async (args) => spawnSubagent(args[0] ?? "", args[1] ?? "codex", args.slice(2).join(" ")),
  mode: async (args) => setAgentMode(args[0] ?? "", args[1], args[2]),
  run: async (args) => runAgent(args[0] ?? "codex", args[1] ?? process.cwd(), args.slice(2).join(" ")),
  runw: async (args) => runAgentInWorkspace(args[0] ?? "codex", args[1] ?? "", args.slice(2).join(" ")),
  send: async (args) => sendPrompt(args[0] ?? "", args.slice(1).join(" ")),
  stop: async (args) => stopAgent(args[0] ?? ""),
  archive: async (args) => archiveAgent(args[0] ?? ""),
};

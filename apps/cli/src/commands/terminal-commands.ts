import type { TerminalOutputEvent, TerminalRecord } from "@gaa/protocol";
import { apiJson, authHeaders } from "../client/daemon-cli-client.js";
import { loadSession } from "../session/session-store.js";
import type { CommandRegistry } from "./types.js";

async function listTerminals(): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/terminals", { headers: authHeaders(session) });
  const terminals = body.terminals as TerminalRecord[];
  for (const terminal of terminals) {
    process.stdout.write(`${terminal.id}\t${terminal.status}\t${terminal.workspaceId ?? "-"}\t${terminal.cwd}\t${terminal.command}\n`);
  }
}

async function createTerminal(workspaceId?: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/terminals", {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ workspaceId }),
  });
  const terminal = body.terminal as TerminalRecord;
  process.stdout.write(`terminal ${terminal.id} created\n`);
}

async function terminalInput(terminalId: string, input: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/terminals/${terminalId}/input`, {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  process.stdout.write("terminal input sent\n");
}

async function terminalKill(terminalId: string): Promise<void> {
  const session = await loadSession();
  await apiJson(session.httpBaseUrl + `/terminals/${terminalId}/kill`, {
    method: "POST",
    headers: authHeaders(session),
  });
  process.stdout.write("terminal killed\n");
}

async function terminalOutput(terminalId: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + `/terminals/${terminalId}/output?limit=1200`, {
    headers: authHeaders(session),
  });
  const events = body.events as TerminalOutputEvent[];
  for (const event of events) {
    if (event.encoding === "base64") process.stdout.write(Buffer.from(event.chunk, "base64"));
    else process.stdout.write(event.chunk);
  }
}

export const terminalCommands: CommandRegistry = {
  terminals: async () => listTerminals(),
  "terminal-create": async (args) => createTerminal(args[0]),
  "terminal-input": async (args) => terminalInput(args[0] ?? "", args.slice(1).join(" ")),
  "terminal-kill": async (args) => terminalKill(args[0] ?? ""),
  "terminal-output": async (args) => terminalOutput(args[0] ?? ""),
};

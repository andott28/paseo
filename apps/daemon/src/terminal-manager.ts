import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { TerminalOutputEvent, TerminalRecord } from "@gaa/protocol";

interface ActiveTerminal {
  record: TerminalRecord;
  child: ChildProcessWithoutNullStreams;
  seq: number;
  history: TerminalOutputEvent[];
}

interface TerminalManagerHooks {
  onUpdate(terminal: TerminalRecord): void;
  onOutput(event: TerminalOutputEvent): void;
}

function defaultCommand(): string {
  if (process.platform === "win32") return "powershell";
  return process.env.SHELL || "bash";
}

export class TerminalManager {
  private readonly terminals = new Map<string, ActiveTerminal>();
  private readonly hooks: TerminalManagerHooks;
  private readonly historyLimit: number;

  constructor(hooks: TerminalManagerHooks, historyLimit = 2000) {
    this.hooks = hooks;
    this.historyLimit = historyLimit;
  }

  listTerminals(): TerminalRecord[] {
    return Array.from(this.terminals.values())
      .map((entry) => entry.record)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  listOutput(terminalId: string, limit = 400): TerminalOutputEvent[] {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) throw new Error(`Terminal not found: ${terminalId}`);
    return terminal.history.slice(-Math.max(1, limit));
  }

  createTerminal(input: { workspaceId?: string | null; cwd: string; command?: string }): TerminalRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    const command = (input.command ?? "").trim() || defaultCommand();
    const child = spawn(command, [], {
      cwd: input.cwd,
      windowsHide: true,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    const record: TerminalRecord = {
      id,
      workspaceId: input.workspaceId ?? null,
      cwd: input.cwd,
      command,
      status: "running",
      createdAt: now,
      updatedAt: now,
    };
    const active: ActiveTerminal = {
      record,
      child,
      seq: 0,
      history: [],
    };
    this.terminals.set(id, active);

    child.stdout.on("data", (chunk) => {
      this.pushOutput(active, "stdout", chunk as Buffer);
    });
    child.stderr.on("data", (chunk) => {
      this.pushOutput(active, "stderr", chunk as Buffer);
    });
    child.on("close", (code, signal) => {
      if (active.record.status === "stopped") return;
      const nowIso = new Date().toISOString();
      active.record = {
        ...active.record,
        status: "stopped",
        updatedAt: nowIso,
      };
      this.hooks.onUpdate(active.record);
      this.pushOutput(active, "system", Buffer.from(`process exited code=${code ?? "null"} signal=${signal ?? "null"}\n`, "utf8"));
    });
    child.on("error", (error) => {
      this.pushOutput(active, "stderr", Buffer.from(`process error: ${error.message}\n`, "utf8"));
    });

    this.hooks.onUpdate(record);
    return record;
  }

  sendInput(input: { terminalId: string; data: string }): void {
    const terminal = this.terminals.get(input.terminalId);
    if (!terminal) throw new Error(`Terminal not found: ${input.terminalId}`);
    if (terminal.record.status !== "running") throw new Error(`Terminal is not running: ${input.terminalId}`);
    terminal.child.stdin.write(input.data);
    terminal.record = {
      ...terminal.record,
      updatedAt: new Date().toISOString(),
    };
    this.hooks.onUpdate(terminal.record);
  }

  killTerminal(terminalId: string): TerminalRecord {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) throw new Error(`Terminal not found: ${terminalId}`);
    if (terminal.record.status === "running") {
      terminal.child.kill("SIGTERM");
    }
    terminal.record = {
      ...terminal.record,
      status: "stopped",
      updatedAt: new Date().toISOString(),
    };
    this.hooks.onUpdate(terminal.record);
    return terminal.record;
  }

  stopAll(): void {
    for (const terminal of this.terminals.keys()) {
      this.killTerminal(terminal);
    }
  }

  private pushOutput(active: ActiveTerminal, stream: TerminalOutputEvent["stream"], chunk: Buffer): void {
    const encoded = encodeTerminalChunk(chunk);
    const event: TerminalOutputEvent = {
      terminalId: active.record.id,
      seq: ++active.seq,
      stream,
      encoding: encoded.encoding,
      byteLength: chunk.length,
      chunk: encoded.chunk,
      createdAt: new Date().toISOString(),
    };
    active.history.push(event);
    if (active.history.length > this.historyLimit) {
      active.history.splice(0, active.history.length - this.historyLimit);
    }
    active.record = {
      ...active.record,
      updatedAt: event.createdAt,
    };
    this.hooks.onOutput(event);
    this.hooks.onUpdate(active.record);
  }
}

function encodeTerminalChunk(input: Buffer): { encoding: "utf8" | "base64"; chunk: string } {
  const asUtf8 = input.toString("utf8");
  const utf8RoundTrip = Buffer.from(asUtf8, "utf8");
  const looksUtf8 = utf8RoundTrip.equals(input) && !asUtf8.includes("\u0000");
  if (looksUtf8) {
    return {
      encoding: "utf8",
      chunk: asUtf8,
    };
  }
  return {
    encoding: "base64",
    chunk: input.toString("base64"),
  };
}

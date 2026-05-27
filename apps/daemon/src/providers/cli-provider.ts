import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { AgentProviderAdapter, CreateSessionInput, ProviderAvailability, SendInput } from "./types.js";

function isWindows(): boolean {
  return process.platform === "win32";
}

async function checkCommand(command: string): Promise<ProviderAvailability> {
  const checker = isWindows() ? "where" : "which";
  return new Promise((resolve) => {
    const child = spawn(checker, [command], { stdio: "ignore" });
    child.once("error", (error) => {
      resolve({ available: false, reason: error.message });
    });
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ available: true });
      } else {
        resolve({ available: false, reason: `Command not found: ${command}` });
      }
    });
  });
}

interface CliProviderOptions {
  id: string;
  command: string;
  timeoutMs: number;
}

export class CliProviderAdapter implements AgentProviderAdapter {
  readonly id: string;
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly runningBySession = new Map<string, { kill: () => void }>();

  constructor(options: CliProviderOptions) {
    this.id = options.id;
    this.command = options.command;
    this.timeoutMs = options.timeoutMs;
  }

  async isAvailable(): Promise<ProviderAvailability> {
    return checkCommand(this.command);
  }

  async createSession(_input: CreateSessionInput) {
    return {
      sessionId: randomUUID(),
      metadata: {
        command: this.command,
      },
    };
  }

  async *send(
    input: SendInput,
  ): AsyncIterable<{ eventType: "assistant_text" | "stderr_text" | "system_status"; text: string; marker?: string | null }> {
    const args: string[] = [];
    if (input.model) {
      args.push("--model", input.model);
    }
    const child = spawn(this.command, args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.runningBySession.set(input.sessionId, {
      kill: () => {
        if (!child.killed) {
          child.kill("SIGTERM");
        }
      },
    });

    const onAbort = () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    };
    input.signal?.addEventListener("abort", onAbort, { once: true });

    let markerSeq = 0;
    const makeMarker = () => `${input.sessionId}:${Date.now()}:${markerSeq++}`;

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const queue: Array<{ eventType: "assistant_text" | "stderr_text"; text: string; marker: string }> = [];
    let streamEnded = false;
    let processClosed = false;
    let closeCode: number | null = null;
    let closeSignal: NodeJS.Signals | null = null;

    const stdoutRl = createInterface({ input: child.stdout });
    stdoutRl.on("line", (line) => {
      const text = line.trimEnd();
      if (text.length > 0) {
        stdoutLines.push(text);
        queue.push({ eventType: "assistant_text", text, marker: makeMarker() });
      }
    });
    stdoutRl.once("close", () => {
      streamEnded = true;
    });

    const stderrRl = createInterface({ input: child.stderr });
    stderrRl.on("line", (line) => {
      const text = line.trimEnd();
      if (text.length > 0) {
        stderrLines.push(text);
        queue.push({ eventType: "stderr_text", text, marker: makeMarker() });
      }
    });

    child.once("close", (code, signal) => {
      processClosed = true;
      closeCode = code;
      closeSignal = signal;
    });

    child.once("error", (error) => {
      queue.push({
        eventType: "stderr_text",
        text: `Provider process failed to start: ${error.message}`,
        marker: makeMarker(),
      });
      processClosed = true;
      closeCode = 1;
    });

    const timeoutHandle = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGTERM");
        queue.push({
          eventType: "stderr_text",
          text: `Provider process timed out after ${this.timeoutMs}ms`,
          marker: makeMarker(),
        });
      }
    }, this.timeoutMs);

    try {
      child.stdin.write(input.prompt);
      child.stdin.end();

      while (!processClosed || queue.length > 0 || !streamEnded) {
        while (queue.length > 0) {
          const event = queue.shift();
          if (!event) {
            continue;
          }
          yield event;
        }
        if (processClosed && queue.length === 0 && streamEnded) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } finally {
      clearTimeout(timeoutHandle);
      input.signal?.removeEventListener("abort", onAbort);
      this.runningBySession.delete(input.sessionId);
      stdoutRl.close();
      stderrRl.close();
    }

    if (closeCode !== 0) {
      const stderrText = stderrLines.join("\n");
      const signalInfo = closeSignal ? ` signal=${closeSignal}` : "";
      throw new Error(
        `Provider command '${this.command}' exited with code ${closeCode}${signalInfo}${
          stderrText.length > 0 ? `\n${stderrText}` : ""
        }`,
      );
    }

    if (stdoutLines.length === 0 && stderrLines.length === 0) {
      yield {
        eventType: "system_status",
        text: `Provider '${this.id}' finished with no stream output.`,
        marker: makeMarker(),
      };
    }
  }

  async stop(input: { sessionId: string }): Promise<void> {
    const running = this.runningBySession.get(input.sessionId);
    if (running) {
      running.kill();
      this.runningBySession.delete(input.sessionId);
    }
  }

  async resume(_input: { sessionId: string; cwd: string }): Promise<void> {
    return;
  }
}

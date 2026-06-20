import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { EvalResult, ToolBridge } from "../types.js";
import { terminateWithTreeKill } from "../../../utils/tree-kill.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_KERNEL_SHUTDOWN_GRACE_MS = 5000;
const PYTHON_KERNEL_SHUTDOWN_FORCE_MS = 2500;

let _counter = 0;
function nextId(): string {
  _counter++;
  return `eval-${Date.now()}-${_counter}`;
}

function sanitizeIdentityPart(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim().replace(/\s+/g, " ") ?? "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function buildPythonKernelProcessEnv(input: {
  cwd: string;
  sessionId: string;
  hasBridge: boolean;
}): NodeJS.ProcessEnv {
  const repoLabel = sanitizeIdentityPart(path.basename(input.cwd), "workspace");
  const shortSessionId = sanitizeIdentityPart(input.sessionId, "session").slice(0, 8);
  const processGroup = `gaa:${repoLabel}`;
  const processLabel = `GAA ${repoLabel} Python eval ${shortSessionId}`;
  return {
    ...process.env,
    EVAL_BRIDGE_URL: input.hasBridge ? "http://127.0.0.1:0" : "",
    EVAL_HMAC_SECRET: "",
    GAA_MANAGED_PROCESS: "1",
    GAA_PROCESS_KIND: "python-eval",
    GAA_PROCESS_GROUP: processGroup,
    GAA_PROCESS_LABEL: processLabel,
    GAA_SESSION_ID: input.sessionId,
    GAA_WORKSPACE_CWD: input.cwd,
    PASEO_MANAGED_PROCESS: "1",
    PASEO_PROCESS_KIND: "python-eval",
    PASEO_PROCESS_GROUP: processGroup,
    PASEO_PROCESS_LABEL: processLabel,
    PASEO_SESSION_ID: input.sessionId,
    PASEO_WORKSPACE_CWD: input.cwd,
  };
}

export class PythonKernel {
  private process: ChildProcess | null = null;
  private cwd: string;
  private sessionId: string;
  private bridge: ToolBridge | undefined;
  private buffer = "";
  private resolvePending: ((result: EvalResult) => void) | null = null;
  private rejectPending: ((err: Error) => void) | null = null;
  private collectedStdout = "";
  private collectedStderr = "";
  private collectedDisplay: unknown = undefined;
  private collectedError: string | undefined = undefined;
  private pendingTimeout: ReturnType<typeof setTimeout> | null = null;
  private _shutdown = false;

  constructor(config: { cwd: string; sessionId: string; bridge?: ToolBridge }) {
    this.cwd = config.cwd;
    this.sessionId = config.sessionId;
    this.bridge = config.bridge;
  }

  static async checkAvailability(): Promise<boolean> {
    try {
      const proc = spawn("python3", ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const exitCode = await new Promise<number>((resolve) => {
        proc.on("close", resolve);
        proc.on("error", () => resolve(1));
      });
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    const runnerPath = path.join(__dirname, "runner.py");
    const preludePath = path.join(__dirname, "prelude.py");

    this.process = spawn("python3", [runnerPath], {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: buildPythonKernelProcessEnv({
        cwd: this.cwd,
        sessionId: this.sessionId,
        hasBridge: Boolean(this.bridge),
      }),
    });

    this.process.stdout!.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.drainBuffer();
    });

    this.process.stderr!.on("data", (_data: Buffer) => {
      // stderr from the runner process itself (not user code)
    });

    this.process.on("exit", (code, signal) => {
      if (!this._shutdown && this.rejectPending) {
        this.rejectPending(
          new Error(`Python process exited unexpectedly (code=${code}, signal=${signal})`),
        );
        this.cleanupPending();
      }
      this.process = null;
    });

    this.process.on("error", (err) => {
      if (this.rejectPending) {
        this.rejectPending(err);
        this.cleanupPending();
      }
    });

    // Load prelude
    const preludeCode = await fs.readFile(preludePath, "utf-8");
    await this.execute(preludeCode, 10000);
  }

  async execute(code: string, timeout?: number): Promise<EvalResult> {
    if (!this.process || !this.process.stdin) {
      throw new Error("Kernel not started");
    }

    const t0 = performance.now();
    const requestId = nextId();
    const effectiveTimeout = timeout ?? 30000;

    const request = { id: requestId, code, timeout: Math.ceil(effectiveTimeout / 1000) };
    this.process.stdin.write(JSON.stringify(request) + "\n");

    const result = await new Promise<EvalResult>((resolve, reject) => {
      this.resolvePending = resolve;
      this.rejectPending = reject;
      this.collectedStdout = "";
      this.collectedStderr = "";
      this.collectedDisplay = undefined;
      this.collectedError = undefined;

      this.pendingTimeout = setTimeout(() => {
        this.interrupt();
        reject(new Error(`Execution timed out after ${effectiveTimeout}ms`));
        this.cleanupPending();
      }, effectiveTimeout + 2000);
    });

    const durationMs = performance.now() - t0;
    return { ...result, durationMs };
  }

  async interrupt(): Promise<void> {
    if (!this.process || !this.process.pid) return;

    const pid = this.process.pid;

    try {
      process.kill(pid, "SIGINT");
    } catch {
      // ignore if process already dead
    }

    // escalation: SIGINT -> 5s -> SIGTERM -> 5s -> SIGKILL
    await PythonKernel.delay(5000);
    if (this.process && this.process.exitCode === null) {
      try {
        this.process.kill("SIGTERM");
      } catch {
        // ignore
      }
    }

    await PythonKernel.delay(5000);
    if (this.process && this.process.exitCode === null) {
      try {
        this.process.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }

  async shutdown(): Promise<void> {
    this._shutdown = true;
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    this.cleanupPending();

    const child = this.process;
    if (child) {
      try {
        child.stdin?.end();
      } catch {
        // ignore shutdown races
      }
      await terminateWithTreeKill(child, {
        gracefulTimeoutMs: PYTHON_KERNEL_SHUTDOWN_GRACE_MS,
        forceTimeoutMs: PYTHON_KERNEL_SHUTDOWN_FORCE_MS,
      });
      if (this.process === child) {
        this.process = null;
      }
    }
  }

  isAlive(): boolean {
    return this.process !== null && this.process.exitCode === null && !this._shutdown;
  }

  private drainBuffer(): void {
    while (this.buffer.includes("\n")) {
      const nlIndex = this.buffer.indexOf("\n");
      const line = this.buffer.slice(0, nlIndex).trim();
      this.buffer = this.buffer.slice(nlIndex + 1);

      if (!line) continue;

      try {
        const frame = JSON.parse(line);
        this.handleFrame(frame);
      } catch {
        // skip malformed frames
      }
    }
  }

  private handleFrame(frame: { type: string; id?: string; [key: string]: unknown }): void {
    switch (frame.type) {
      case "stdout":
        this.collectedStdout += (frame.text as string) || "";
        break;
      case "stderr":
        this.collectedStderr += (frame.text as string) || "";
        break;
      case "display":
        this.collectedDisplay = frame.data;
        break;
      case "result":
        // success, just wait for "done"
        break;
      case "error":
        this.collectedError = (frame.message as string) || "Unknown error";
        break;
      case "done":
        if (this.resolvePending) {
          this.resolvePending({
            language: "python",
            stdout: this.collectedStdout,
            stderr: this.collectedStderr,
            display: this.collectedDisplay,
            error: this.collectedError,
            durationMs: 0,
          });
          this.cleanupPending();
        }
        break;
    }
  }

  private cleanupPending(): void {
    this.resolvePending = null;
    this.rejectPending = null;
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

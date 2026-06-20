import vm from "node:vm";
import { EvalResult, ToolBridge } from "../types.js";

export class JsRuntime {
  private context: vm.Context;
  private bridge: ToolBridge | undefined;
  private capturedLogs: string[];
  private capturedErrors: string[];
  private capturedDisplay: unknown;

  constructor(_cwd: string, bridge?: ToolBridge) {
    this.bridge = bridge;
    this.capturedLogs = [];
    this.capturedErrors = [];
    this.capturedDisplay = undefined;

    const sandbox: Record<string, unknown> = {
      console: {
        log: (...args: unknown[]) => {
          this.capturedLogs.push(args.map(String).join(" "));
        },
        error: (...args: unknown[]) => {
          this.capturedErrors.push(args.map(String).join(" "));
        },
        warn: (...args: unknown[]) => {
          this.capturedLogs.push(args.map(String).join(" "));
        },
        info: (...args: unknown[]) => {
          this.capturedLogs.push(args.map(String).join(" "));
        },
      },
      tool: {
        read: async (p: string) => {
          if (!this.bridge) throw new Error("Tool bridge not available");
          return this.bridge.read(p);
        },
        write: async (p: string, content: string) => {
          if (!this.bridge) throw new Error("Tool bridge not available");
          return this.bridge.write(p, content);
        },
        grep: async (pattern: string, p: string) => {
          if (!this.bridge) throw new Error("Tool bridge not available");
          return this.bridge.grep(pattern, p);
        },
        glob: async (pattern: string, root?: string) => {
          if (!this.bridge) throw new Error("Tool bridge not available");
          return this.bridge.glob(pattern, root ?? ".");
        },
      },
      display: (data: unknown) => {
        this.capturedDisplay = data;
      },
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      clearImmediate: undefined,
      __dirname: undefined,
      __filename: undefined,
      exports: undefined,
      require: undefined,
      module: undefined,
      process: undefined,
      global: undefined,
      Buffer: undefined,
    };

    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;

    this.context = vm.createContext(sandbox);
  }

  async execute(code: string, timeout?: number): Promise<EvalResult> {
    const t0 = performance.now();
    const effectiveTimeout = timeout ?? 30000;

    this.capturedLogs = [];
    this.capturedErrors = [];
    this.capturedDisplay = undefined;

    const script = new vm.Script(code, {
      filename: "eval.js",
    });

    try {
      script.runInContext(this.context, {
        timeout: effectiveTimeout,
        breakOnSigint: true,
      });
    } catch (err: unknown) {
      const durationMs = performance.now() - t0;
      return {
        language: "js",
        stdout: this.capturedLogs.join("\n"),
        stderr: this.capturedErrors.join("\n"),
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      };
    }

    const durationMs = performance.now() - t0;
    return {
      language: "js",
      stdout: this.capturedLogs.join("\n"),
      stderr: this.capturedErrors.join("\n"),
      display: this.capturedDisplay,
      durationMs,
    };
  }

  async shutdown(): Promise<void> {
    this.context = vm.createContext({});
  }
}

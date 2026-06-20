import { EvalResult, ExecutorBackend, EvalLanguage, ToolBridge } from "./types.js";
import { PythonKernel } from "./py/kernel.js";
import { JsRuntime } from "./js/executor.js";

export type { ExecutorBackend };

class PythonBackend implements ExecutorBackend {
  readonly id = "python" as const;
  readonly label = "Python";
  private kernel: PythonKernel | null = null;
  private bridge: ToolBridge | undefined;

  constructor(bridge?: ToolBridge) {
    this.bridge = bridge;
  }

  isAvailable(): Promise<boolean> {
    return PythonKernel.checkAvailability();
  }

  async execute(code: string, opts: { timeout?: number; cwd: string; sessionId: string }): Promise<EvalResult> {
    if (!this.kernel) {
      this.kernel = new PythonKernel({ cwd: opts.cwd, sessionId: opts.sessionId, bridge: this.bridge });
      await this.kernel.start();
    }
    return this.kernel.execute(code, opts.timeout);
  }

  async shutdown(): Promise<void> {
    if (this.kernel) {
      await this.kernel.shutdown();
      this.kernel = null;
    }
  }
}

class JsBackend implements ExecutorBackend {
  readonly id = "js" as const;
  readonly label = "JavaScript";
  private runtime: JsRuntime | null = null;
  private bridge: ToolBridge | undefined;

  constructor(bridge?: ToolBridge) {
    this.bridge = bridge;
  }

  isAvailable(): boolean {
    return true;
  }

  async execute(code: string, opts: { timeout?: number; cwd: string; sessionId: string }): Promise<EvalResult> {
    if (!this.runtime) {
      this.runtime = new JsRuntime(opts.cwd, this.bridge);
    }
    return this.runtime.execute(code, opts.timeout);
  }

  async shutdown(): Promise<void> {
    if (this.runtime) {
      await this.runtime.shutdown();
      this.runtime = null;
    }
  }
}

export function createBackend(language: EvalLanguage, bridge?: ToolBridge): ExecutorBackend {
  if (language === "python") {
    return new PythonBackend(bridge);
  }
  return new JsBackend(bridge);
}

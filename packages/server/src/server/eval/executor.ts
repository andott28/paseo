import { EvalLanguage, EvalCell, EvalResult, ToolBridge } from "./types.js";
import { createBackend, ExecutorBackend } from "./backend.js";

export class EvalExecutor {
  private backends: Map<EvalLanguage, ExecutorBackend> = new Map();
  private bridge: ToolBridge | undefined;

  constructor(bridge?: ToolBridge) {
    this.bridge = bridge;
  }

  async getBackend(language: EvalLanguage): Promise<ExecutorBackend> {
    let backend = this.backends.get(language);
    if (!backend) {
      backend = createBackend(language, this.bridge);
      const available = await Promise.resolve(backend.isAvailable());
      if (!available) {
        throw new Error(`Backend "${language}" is not available`);
      }
      this.backends.set(language, backend);
    }
    return backend;
  }

  async execute(
    cells: EvalCell[],
    options: { cwd: string; sessionId: string },
  ): Promise<EvalResult[]> {
    const results: EvalResult[] = [];

    for (const cell of cells) {
      const backend = await this.getBackend(cell.language);
      const result = await backend.execute(cell.code, {
        cwd: options.cwd,
        sessionId: options.sessionId,
        timeout: cell.timeout,
      });
      results.push(result);
    }

    return results;
  }

  async shutdown(): Promise<void> {
    for (const [, backend] of this.backends) {
      await backend.shutdown();
    }
    this.backends.clear();
  }
}

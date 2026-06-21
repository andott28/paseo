import { randomUUID } from "node:crypto";
import { createBackend, EvalExecutor, InMemoryFilesystem, type EvalCell, type EvalLanguage, type EvalResult, type ExecutorBackend } from "./index.js";
import type { Logger } from "pino";

export interface EvalSandboxManagerOptions {
  /** Default timeout for a single eval cell in ms. Default 30000. */
  defaultTimeoutMs?: number;
  logger: Logger;
}

export interface EvalSessionSummary {
  sessionId: string;
  language: EvalLanguage;
  cwd: string;
  createdAt: number;
  lastUsedAt: number;
  executionCount: number;
}

/**
 * Manages long-lived eval (Python/JS) sessions for the agent MCP tools.
 *
 * Each session owns a dedicated EvalExecutor (with its Python kernel or JS
 * runtime) and an in-memory filesystem. Variables/state persist across
 * consecutive eval calls within the same session, like a Jupyter kernel.
 *
 * Sessions are keyed by (cwd, language). A given workspace cwd may have one
 * active Python session and one active JS session at a time.
 */
export class EvalSandboxManager {
  private logger: Logger;
  private defaultTimeoutMs: number;
  private sessions = new Map<string, {
    language: EvalLanguage;
    executor: EvalExecutor;
    memfs: InMemoryFilesystem;
    cwd: string;
    createdAt: number;
    lastUsedAt: number;
    executionCount: number;
  }>();

  constructor(options: EvalSandboxManagerOptions) {
    this.logger = options.logger.child({ component: "eval-sandbox" });
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
  }

  isAvailable(language: EvalLanguage): boolean {
    // JS is always available; Python is checked at session creation.
    return true;
  }

  /**
   * Returns the active session for (cwd, language), or creates a new one.
   * Returns the session id and whether it was just created.
   */
  async ensureSession(
    cwd: string,
    language: EvalLanguage,
  ): Promise<{ sessionId: string; created: boolean }> {
    const key = this.sessionKey(cwd, language);
    const existing = this.sessions.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return { sessionId: key, created: false };
    }

    // Pre-flight availability check.
    const probe = createBackend(language);
    const available = await Promise.resolve(probe.isAvailable());
    await probe.shutdown().catch(() => undefined);
    if (!available) {
      throw new Error(`${language} backend is not available on this system`);
    }

    const memfs = new InMemoryFilesystem();
    const executor = new EvalExecutor();
    const now = Date.now();
    this.sessions.set(key, {
      language,
      executor,
      memfs,
      cwd,
      createdAt: now,
      lastUsedAt: now,
      executionCount: 0,
    });
    this.logger.info({ sessionId: key, language, cwd }, "Created eval sandbox session");
    return { sessionId: key, created: true };
  }

  /**
   * Execute a single cell of code in the given session.
   * State (variables, imported modules, etc.) persists across calls.
   */
  async execute(
    sessionId: string,
    code: string,
    timeoutMs?: number,
  ): Promise<EvalResult> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      throw new Error(`Unknown eval session: ${sessionId}`);
    }
    entry.lastUsedAt = Date.now();
    entry.executionCount += 1;
    const cell: EvalCell = {
      language: entry.language,
      code,
      timeout: timeoutMs ?? this.defaultTimeoutMs,
    };
    const [result] = await entry.executor.execute([cell], {
      cwd: entry.cwd,
      sessionId,
    });
    return result;
  }

  /** Destroy a session and its backend/kernel. */
  async reset(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    await entry.executor.shutdown().catch(() => undefined);
    this.sessions.delete(sessionId);
    this.logger.info({ sessionId }, "Reset eval sandbox session");
  }

  /** Destroy every active session. */
  async resetAll(): Promise<void> {
    const keys = [...this.sessions.keys()];
    for (const k of keys) await this.reset(k);
  }

  /** List every active session with a short summary. */
  list(): EvalSessionSummary[] {
    return [...this.sessions.entries()].map(([sessionId, entry]) => ({
      sessionId,
      language: entry.language,
      cwd: entry.cwd,
      createdAt: entry.createdAt,
      lastUsedAt: entry.lastUsedAt,
      executionCount: entry.executionCount,
    }));
  }

  /** Direct access to the in-memory filesystem of a session. */
  getMemfs(sessionId: string): InMemoryFilesystem | null {
    return this.sessions.get(sessionId)?.memfs ?? null;
  }

  async shutdown(): Promise<void> {
    await this.resetAll();
    this.logger.info("EvalSandboxManager shut down");
  }

  private sessionKey(cwd: string, language: EvalLanguage): string {
    return `${language}::${cwd}`;
  }
}

let globalManager: EvalSandboxManager | null = null;

export function getEvalSandboxManager(options: EvalSandboxManagerOptions): EvalSandboxManager {
  if (!globalManager) {
    globalManager = new EvalSandboxManager(options);
  }
  return globalManager;
}

export async function resetGlobalEvalSandboxManager(): Promise<void> {
  if (globalManager) {
    await globalManager.shutdown();
    globalManager = null;
  }
}

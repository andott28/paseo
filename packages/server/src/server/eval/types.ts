export type EvalLanguage = "python" | "js";

export interface EvalCell {
  language: EvalLanguage;
  code: string;
  title?: string;
  timeout?: number;
  reset?: boolean;
}

export interface EvalResult {
  language: EvalLanguage;
  stdout: string;
  stderr: string;
  display?: unknown;
  error?: string;
  durationMs: number;
}

export interface ExecutorBackend {
  readonly id: EvalLanguage;
  readonly label: string;
  isAvailable(): Promise<boolean> | boolean;
  execute(code: string, opts: { timeout?: number; cwd: string; sessionId: string }): Promise<EvalResult>;
  shutdown(): Promise<void>;
}

export interface ToolBridge {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  grep(pattern: string, path: string): Promise<string>;
  glob(pattern: string, root: string): Promise<string[]>;
}

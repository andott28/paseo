export type AgentType = "explore" | "plan" | "designer" | "reviewer" | "librarian" | "oracle" | "task" | "quick_task";

export interface AgentDefinition {
  name: AgentType;
  label: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  isolatedWorktree?: boolean;
}

export interface SubprocessOptions {
  prompt: string;
  agentType: AgentType;
  cwd: string;
  files?: string[];
  schema?: Record<string, unknown>;
  maxTurns?: number;
  timeout?: number;
  parentAgentId?: string;
}

export interface SubprocessResult {
  output: string;
  structured?: Record<string, unknown>;
  findings?: ReviewFinding[];
  durationMs: number;
  turnCount: number;
}

export interface ReviewFinding {
  severity: "P0" | "P1" | "P2" | "P3";
  confidence: number;
  file: string;
  line?: number;
  title: string;
  description: string;
  suggestion?: string;
  ruleId?: string;
}

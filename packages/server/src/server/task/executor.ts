// Integration notes:
// - executor.createAgent expects the AgentManager's createAgent method
// - executor.waitForAgentEvent expects the AgentManager's waitForAgentEvent method
// - report_finding tool calls are parsed from the subagent's timeline
// - The task system replaces the previous review/ module entirely

import type { SubprocessOptions, SubprocessResult, ReviewFinding, AgentType } from "./types.js";
import { getAgentDefinition } from "./agents.js";

const SEVERITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export interface ExecutorOptions {
  createAgent: (
    config: {
      provider: string;
      cwd: string;
      systemPrompt?: string;
    },
    agentId?: string,
    options?: {
      labels?: Record<string, string>;
      initialPrompt?: string;
      persistSession?: boolean;
    },
  ) => Promise<{ id: string }>;
  cancelAgentRun: (agentId: string) => Promise<boolean>;
  waitForAgentEvent: (
    agentId: string,
    options?: {
      signal?: AbortSignal;
      waitForActive?: boolean;
    },
  ) => Promise<{
    status: string;
    permission: unknown;
    lastMessage: string | null;
  }>;
  getTimeline: (
    agentId: string,
  ) => Promise<Array<{ type: string; text?: string; status?: string; detail?: unknown }>>;
}

function buildPrompt(options: SubprocessOptions): string {
  let prompt = options.prompt;

  if (options.files && options.files.length > 0) {
    prompt = `Relevant files:\n${options.files.map(f => `  - ${f}`).join("\n")}\n\n${prompt}`;
  }

  if (options.schema) {
    prompt += `\n\nRespond in the following JSON schema:\n\`\`\`json\n${JSON.stringify(options.schema, null, 2)}\n\`\`\``;
  }

  return prompt;
}

function parseStructuredOutput(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not JSON
  }

  const jsonBlock = text.match(/```json\n?([\s\S]*?)\n?```/);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock[1]);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // not valid JSON
    }
  }

  return undefined;
}

function parseFindingFromTimelineItem(
  item: { type: string; text?: string; status?: string; detail?: unknown },
): ReviewFinding | undefined {
  if (item.type !== "tool_call") return undefined;
  if (item.status !== "completed") return undefined;

  const detail = item.detail as Record<string, unknown> | undefined;
  if (!detail) return undefined;

  const name = detail.name as string | undefined;
  if (name !== "report_finding") return undefined;

  const input = detail.input as Record<string, unknown> | undefined;
  if (!input) return undefined;

  const severity = input.severity as string;
  if (!["P0", "P1", "P2", "P3"].includes(severity)) return undefined;

  return {
    severity: severity as ReviewFinding["severity"],
    confidence: Number(input.confidence ?? 1.0),
    file: String(input.file ?? ""),
    line: input.line != null ? Number(input.line) : undefined,
    title: String(input.title ?? ""),
    description: String(input.description ?? ""),
    suggestion: input.suggestion != null ? String(input.suggestion) : undefined,
    ruleId: input.ruleId != null ? String(input.ruleId) : undefined,
  };
}

function buildReviewPrompt(files: Array<{ path: string; status: string; diffContent: string }>): string {
  const parts = files.map(
    f => `### ${f.path} (${f.status})\n\`\`\`diff\n${f.diffContent}\n\`\`\``,
  );
  return `Review the following changes:\n\n${parts.join("\n\n")}\n\nUse the report_finding tool to report each issue you find.`;
}

export async function runSubprocess(
  options: SubprocessOptions,
  executor: ExecutorOptions,
): Promise<SubprocessResult> {
  const startTime = Date.now();
  const agentDef = getAgentDefinition(options.agentType);
  if (!agentDef) {
    throw new Error(`Unknown agent type: ${options.agentType}`);
  }

  const prompt = buildPrompt(options);
  const labels: Record<string, string> = {};
  if (options.parentAgentId) {
    labels.parentAgentId = options.parentAgentId;
  }

  const agent = await executor.createAgent(
    {
      provider: "opencode",
      cwd: options.cwd,
      systemPrompt: agentDef.systemPrompt,
    },
    undefined,
    {
      labels,
      initialPrompt: prompt,
      persistSession: false,
    },
  );

  try {
    const result = await executor.waitForAgentEvent(agent.id, {
      waitForActive: true,
    });

    const durationMs = Date.now() - startTime;
    const timeline = await executor.getTimeline(agent.id);

    let structured: Record<string, unknown> | undefined;
    let turnCount = 0;
    const findings: ReviewFinding[] = [];

    for (const item of timeline) {
      if (item.type === "assistant_message" && item.text != null) {
        turnCount++;
        if (!structured) {
          structured = parseStructuredOutput(item.text);
        }
      }

      const finding = parseFindingFromTimelineItem(item);
      if (finding) {
        findings.push(finding);
      }
    }

    return {
      output: result.lastMessage ?? "",
      structured,
      findings: findings.length > 0 ? findings : undefined,
      durationMs,
      turnCount,
    };
  } finally {
    await executor.cancelAgentRun(agent.id).catch(() => {});
  }
}

export async function runReview(
  diffFiles: Array<{ path: string; status: string; diffContent: string }>,
  cwd: string,
  executor: ExecutorOptions,
): Promise<{ findings: ReviewFinding[] }> {
  const prompt = buildReviewPrompt(diffFiles);

  const result = await runSubprocess(
    {
      prompt,
      agentType: "reviewer" as AgentType,
      cwd,
    },
    executor,
  );

  const findings = result.findings ?? [];

  findings.sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    if (sevDiff !== 0) return sevDiff;
    return b.confidence - a.confidence;
  });

  return { findings };
}

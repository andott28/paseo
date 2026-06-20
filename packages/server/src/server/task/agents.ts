import type { AgentDefinition, AgentType } from "./types.js";

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    name: "explore",
    label: "Explorer",
    description: "Searches the codebase to understand existing code",
    systemPrompt: "You are an explore agent. Search the codebase thoroughly...",
    tools: ["search", "grep", "glob", "read"],
    isolatedWorktree: false,
  },
  {
    name: "reviewer",
    label: "Reviewer",
    description: "Reviews code changes for bugs, security issues, and quality",
    systemPrompt: `You are a code reviewer. Review the provided diff or files for:\n1. Correctness (logic bugs, edge cases)\n2. Security (vulnerabilities, credential leaks)\n3. Code quality (style, maintainability)\n4. Test coverage\n\nUse the report_finding tool to submit each issue found.\nRate each finding:\n- P0: Critical — must fix before merge\n- P1: High — should fix\n- P2: Medium — consider fixing\n- P3: Low — suggestion\n\nAssign a confidence score 0.0-1.0.`,
    tools: ["search", "grep", "glob", "read", "report_finding"],
    isolatedWorktree: true,
  },
  {
    name: "plan",
    label: "Planner",
    description: "Creates implementation plans for complex changes",
    systemPrompt: "You are a planning agent. Analyze the request...",
    tools: ["search", "grep", "glob", "read", "bash"],
    isolatedWorktree: false,
  },
  {
    name: "designer",
    label: "Designer",
    description: "Designs architecture and component structure",
    systemPrompt: "You are a design agent. Analyze requirements...",
    tools: ["search", "grep", "glob", "read"],
    isolatedWorktree: false,
  },
  {
    name: "librarian",
    label: "Librarian",
    description: "Indexes and catalogs code for reference",
    systemPrompt: "You are a librarian agent. Catalog the codebase...",
    tools: ["search", "grep", "glob", "read"],
    isolatedWorktree: false,
  },
  {
    name: "oracle",
    label: "Oracle",
    description: "Answers questions using deep analysis",
    systemPrompt: "You are an oracle agent. Answer questions...",
    tools: ["search", "grep", "glob", "read", "bash"],
    isolatedWorktree: false,
  },
  {
    name: "task",
    label: "Task",
    description: "General purpose subagent for running tasks",
    systemPrompt: "You are a task agent. Complete the assigned task...",
    tools: ["search", "grep", "glob", "read", "edit", "write", "bash"],
    isolatedWorktree: true,
  },
  {
    name: "quick_task",
    label: "Quick Task",
    description: "Lightweight subagent for quick questions",
    systemPrompt: "You are a quick task agent. Answer concisely...",
    tools: ["search", "grep", "read"],
    isolatedWorktree: false,
  },
];

export function getAgentDefinition(type: AgentType): AgentDefinition | undefined {
  return AGENT_DEFINITIONS.find(a => a.name === type);
}

import type { AppConfig } from "../config.js";
import { ProviderRegistry } from "./registry.js";
import { createCodexProvider } from "./codex-provider.js";
import { createClaudeProvider } from "./claude-provider.js";
import { createOpenCodeProvider } from "./opencode-provider.js";
import type { AgentProviderAdapter } from "./types.js";

interface ProviderFactoryInput {
  command: string;
  timeoutMs: number;
}

type ProviderFactory = (input: ProviderFactoryInput) => AgentProviderAdapter;

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  codex: ({ command, timeoutMs }) => createCodexProvider(command, timeoutMs),
  claude: ({ command, timeoutMs }) => createClaudeProvider(command, timeoutMs),
  opencode: ({ command, timeoutMs }) => createOpenCodeProvider(command, timeoutMs),
};

export function buildDefaultProviderRegistry(config: AppConfig): ProviderRegistry {
  const registry = new ProviderRegistry();
  const commandsByProvider: Record<string, string> = {
    codex: config.GAA_PROVIDER_CODEX_CMD,
    claude: config.GAA_PROVIDER_CLAUDE_CMD,
    opencode: config.GAA_PROVIDER_OPENCODE_CMD,
  };

  for (const [providerId, factory] of Object.entries(PROVIDER_FACTORIES)) {
    const command = commandsByProvider[providerId];
    if (!command) {
      continue;
    }
    registry.register(factory({ command, timeoutMs: config.GAA_PROVIDER_TIMEOUT_MS }));
  }

  return registry;
}

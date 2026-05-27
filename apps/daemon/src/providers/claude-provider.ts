import { CliProviderAdapter } from "./cli-provider.js";

export function createClaudeProvider(command: string, timeoutMs: number): CliProviderAdapter {
  return new CliProviderAdapter({
    id: "claude",
    command,
    timeoutMs,
  });
}

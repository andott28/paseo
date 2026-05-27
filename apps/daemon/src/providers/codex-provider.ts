import { CliProviderAdapter } from "./cli-provider.js";

export function createCodexProvider(command: string, timeoutMs: number): CliProviderAdapter {
  return new CliProviderAdapter({
    id: "codex",
    command,
    timeoutMs,
  });
}

import { CliProviderAdapter } from "./cli-provider.js";

export function createOpenCodeProvider(command: string, timeoutMs: number): CliProviderAdapter {
  return new CliProviderAdapter({
    id: "opencode",
    command,
    timeoutMs,
  });
}

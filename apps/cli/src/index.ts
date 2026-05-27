#!/usr/bin/env node
import { DEFAULT_DAEMON_BASE, pair } from "./client/daemon-cli-client.js";
import { agentCommands } from "./commands/agent-commands.js";
import { printHelp } from "./commands/help.js";
import { opsCommands } from "./commands/ops-commands.js";
import type { CommandRegistry } from "./commands/types.js";
import { workspaceCommands } from "./commands/workspace-commands.js";
import { terminalCommands } from "./commands/terminal-commands.js";

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  return { command: command ?? "help", rest };
}

const commands: CommandRegistry = {
  ...agentCommands,
  ...workspaceCommands,
  ...terminalCommands,
  ...opsCommands,
};

async function main() {
  const { command, rest } = parseArgs(process.argv.slice(2));
  if (command === "pair") return pair(rest[0] ?? DEFAULT_DAEMON_BASE);
  const handler = commands[command];
  if (handler) return handler(rest);
  printHelp();
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exit(1);
});

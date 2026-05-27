export function printHelp(): void {
  process.stdout.write(
    "gaa pair [daemonBase]\n" +
      "gaa ls\n" +
      "gaa logs <agentId>\n" +
      "gaa subagents <agentId>\n" +
      "gaa spawn <parentAgentId> <provider> <prompt>\n" +
      "gaa mode <agentId> [chat|plan|auto] [allow|ask|deny]\n" +
      "gaa projects\n" +
      "gaa project-add <name> <rootPath>\n" +
      "gaa workspaces\n" +
      "gaa workspace-create <projectId> <name> [branch]\n" +
      "gaa terminals\n" +
      "gaa terminal-create [workspaceId]\n" +
      "gaa terminal-input <terminalId> <input>\n" +
      "gaa terminal-kill <terminalId>\n" +
      "gaa terminal-output <terminalId>\n" +
      "gaa permissions [pending|approved|denied|expired]\n" +
      "gaa approve <permissionId> [note]\n" +
      "gaa deny <permissionId> [note]\n" +
      "gaa schedules\n" +
      "gaa schedule-add <provider> <cwd> <intervalSec> <prompt> [workspaceId]\n" +
      "gaa schedule-pause <scheduleId>\n" +
      "gaa schedule-resume <scheduleId>\n" +
      "gaa schedule-run <scheduleId>\n" +
      "gaa schedule-delete <scheduleId>\n" +
      "gaa mcp-servers\n" +
      "gaa mcp-add <name> <command> [args...]\n" +
      "gaa mcp-start <serverId>\n" +
      "gaa mcp-stop <serverId>\n" +
      "gaa mcp-remove <serverId>\n" +
      "gaa relay-open [clientName]\n" +
      "gaa relay-list\n" +
      "gaa relay-poll <relaySessionId> [timeoutMs]\n" +
      "gaa relay-send <relaySessionId> <envelopeJson>\n" +
      "gaa relay-close <relaySessionId>\n" +
      "gaa voice-sessions\n" +
      "gaa voice-start [agentId] [workspaceId]\n" +
      "gaa voice-chunk <voiceSessionId> <text> [--send]\n" +
      "gaa voice-events <voiceSessionId>\n" +
      "gaa voice-end <voiceSessionId>\n" +
      "gaa run <provider> <cwd> <prompt>\n" +
      "gaa runw <provider> <workspaceId> <prompt>\n" +
      "gaa send <agentId> <prompt>\n" +
      "gaa stop <agentId>\n" +
      "gaa archive <agentId>\n",
  );
}

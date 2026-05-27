import type { JSX, ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type {
  AgentRecord,
  McpServerRecord,
  PermissionRequestRecord,
  ProjectRecord,
  RelaySessionRecord,
  ScheduleRecord,
  TerminalRecord,
  VoiceChunkEvent,
  VoiceSessionRecord,
  WorkspaceRecord,
} from "@gaa/protocol";
import type { ConnectionState, ClientSession } from "../types";
import { s } from "../styles";

function ModeChip(props: {
  label: string;
  active?: boolean;
}): JSX.Element {
  return (
    <View style={[s.segmentedChip, props.active && s.segmentedChipActive]}>
      <Text style={[s.segmentedChipText, props.active && s.segmentedChipTextActive]}>{props.label}</Text>
    </View>
  );
}

function SectionCard(props: {
  title: string;
  sub: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <View style={s.utilityCard}>
      <View style={s.panelHeaderStack}>
        <Text style={s.panelTitle}>{props.title}</Text>
        <Text style={s.panelSub}>{props.sub}</Text>
      </View>
      {props.children}
    </View>
  );
}

export function AgentsHomeScreen(props: {
  brandLogo: number;
  session: ClientSession;
  connectionState: ConnectionState;
  providerInput: string;
  setProviderInput(v: string): void;
  agentModeInput: "chat" | "plan" | "auto";
  setAgentModeInput(v: "chat" | "plan" | "auto"): void;
  agentPermissionModeInput: "allow" | "ask" | "deny";
  setAgentPermissionModeInput(v: "allow" | "ask" | "deny"): void;
  cwdInput: string;
  setCwdInput(v: string): void;
  promptInput: string;
  setPromptInput(v: string): void;
  projects: ProjectRecord[];
  workspaces: WorkspaceRecord[];
  selectedWorkspaceId: string | null;
  selectWorkspace(workspaceId: string): void;
  newProjectName: string;
  setNewProjectName(v: string): void;
  newProjectRootPath: string;
  setNewProjectRootPath(v: string): void;
  createProject(): Promise<void>;
  newWorkspaceName: string;
  setNewWorkspaceName(v: string): void;
  newWorkspaceBranch: string;
  setNewWorkspaceBranch(v: string): void;
  createWorkspace(): Promise<void>;
  terminals: TerminalRecord[];
  selectedTerminalId: string | null;
  selectTerminal(terminalId: string): void;
  createTerminal(): Promise<void>;
  terminalInput: string;
  setTerminalInput(v: string): void;
  sendTerminalInput(): Promise<void>;
  killTerminal(): Promise<void>;
  terminalOutputText: string;
  busy: boolean;
  createAgent(): Promise<void>;
  sortedAgents: AgentRecord[];
  openAgent(agentId: string): void;
  disconnect(): Promise<void>;
  desktopDaemonBase: string | null;
  mobileHostInput: string;
  setMobileHostInput(v: string): void;
  mobilePairBusy: boolean;
  mobilePairQr: string | null;
  mobilePairUrl: string | null;
  createMobilePairingQr(): Promise<void>;
  connectionError: string | null;
  statusColors: Record<string, string>;
  selectedWorkspace: WorkspaceRecord | null;
  projectNameById: Record<string, string>;
  pendingPermissions: PermissionRequestRecord[];
  approvePermission(permissionId: string): Promise<void>;
  denyPermission(permissionId: string): Promise<void>;
  schedules: ScheduleRecord[];
  scheduleIntervalInput: string;
  setScheduleIntervalInput(v: string): void;
  schedulePromptInput: string;
  setSchedulePromptInput(v: string): void;
  createSchedule(): Promise<void>;
  scheduleAction(scheduleId: string, action: "pause" | "resume" | "run" | "delete"): Promise<void>;
  mcpServers: McpServerRecord[];
  newMcpName: string;
  setNewMcpName(v: string): void;
  newMcpCommand: string;
  setNewMcpCommand(v: string): void;
  newMcpArgs: string;
  setNewMcpArgs(v: string): void;
  createMcpServer(): Promise<void>;
  mcpAction(serverId: string, action: "start" | "stop" | "remove"): Promise<void>;
  relaySessions: RelaySessionRecord[];
  createRelaySession(): Promise<void>;
  closeRelaySession(relaySessionId: string): Promise<void>;
  voiceSessions: VoiceSessionRecord[];
  selectedVoiceSessionId: string | null;
  selectVoiceSession(voiceSessionId: string): void;
  createVoiceSession(): Promise<void>;
  endVoiceSession(): Promise<void>;
  voiceTextInput: string;
  setVoiceTextInput(v: string): void;
  sendVoiceText(): Promise<void>;
  selectedVoiceEvents: VoiceChunkEvent[];
  selectedVoiceSession: VoiceSessionRecord | null;
}) {
  return (
    <SafeAreaView style={s.container}>
      <StatusBar style="light" />
      <View style={s.shell}>
        <View style={s.shellHeader}>
          <Image source={props.brandLogo} style={s.logo} />
          <View style={s.shellHeaderMeta}>
            <Text style={s.shellTitle}>GAA Workspace</Text>
            <Text style={s.shellSubtitle}>
              Modeled on the shipped Paseo desktop shell. Workspace-first, agent-first, desktop-first.
            </Text>
          </View>
          <View style={s.shellBadge}>
            <Text style={s.shellBadgeText}>{props.connectionState}</Text>
          </View>
          <View style={s.shellBadge}>
            <Text style={s.shellBadgeText}>{props.session.serverId.slice(0, 12)}</Text>
          </View>
          <Pressable style={s.ghostBtn} onPress={() => void props.disconnect()}>
            <Text style={s.ghostBtnText}>Disconnect</Text>
          </Pressable>
        </View>

        <View style={s.shellBody}>
          <View style={s.leftSidebar}>
            <View style={s.sidebarSection}>
              <Text style={s.sidebarSectionTitle}>Projects</Text>
              <ScrollView style={{ maxHeight: 160 }}>
                {props.projects.map((project) => (
                  <View key={project.id} style={s.sidebarItem}>
                    <Text style={s.sidebarItemTitle}>{project.name}</Text>
                    <Text style={s.sidebarItemPath}>{project.rootPath}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>

            <View style={s.sidebarSection}>
              <Text style={s.sidebarSectionTitle}>Workspaces</Text>
              <ScrollView style={{ maxHeight: 220 }}>
                {props.workspaces.map((workspace) => (
                  <Pressable
                    key={workspace.id}
                    style={[s.sidebarItem, props.selectedWorkspaceId === workspace.id && s.sidebarItemActive]}
                    onPress={() => props.selectWorkspace(workspace.id)}
                  >
                    <Text style={s.sidebarItemTitle}>{workspace.name}</Text>
                    <Text style={s.sidebarItemMeta}>
                      {workspace.kind} {workspace.branch ? `- ${workspace.branch}` : ""}
                    </Text>
                    <Text style={s.sidebarItemPath}>{props.projectNameById[workspace.projectId] ?? workspace.projectId}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={[s.sidebarSection, s.agentListWrap]}>
              <Text style={s.sidebarSectionTitle}>Agents</Text>
              <ScrollView style={s.scrollArea}>
                {props.sortedAgents.length === 0 ? <Text style={s.empty}>No agents yet.</Text> : null}
                {props.sortedAgents.map((agent) => (
                  <Pressable key={agent.id} style={s.sidebarItem} onPress={() => props.openAgent(agent.id)}>
                    <View style={s.agentRowTop}>
                      <View style={[s.statusDotSm, { backgroundColor: props.statusColors[agent.status] ?? "#A1A5A4" }]} />
                      <Text style={s.sidebarItemTitle}>{agent.title || agent.id.slice(0, 8)}</Text>
                    </View>
                    <Text style={s.sidebarItemMeta}>
                      {agent.provider} {agent.mode}/{agent.permissionMode}
                    </Text>
                    <Text style={s.sidebarItemPath}>{agent.cwd}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          <View style={s.centerPane}>
            <View style={s.primaryPanel}>
              <View style={s.panelHeader}>
                <View style={s.panelHeaderStack}>
                  <Text style={s.panelTitle}>Current Workspace</Text>
                  <Text style={s.panelSub}>
                    {props.selectedWorkspace
                      ? `${props.selectedWorkspace.name} at ${props.selectedWorkspace.rootPath}`
                      : "Select a workspace from the left rail to anchor new agents and tools."}
                  </Text>
                </View>
                <View style={s.segmentedRow}>
                  <ModeChip label={props.providerInput || "codex"} active />
                  <ModeChip label={props.agentModeInput} active />
                  <ModeChip label={props.agentPermissionModeInput} active />
                </View>
              </View>

              <View style={s.formGrid}>
                <View style={s.formField}>
                  <Text style={s.fieldLabel}>Provider</Text>
                  <TextInput value={props.providerInput} onChangeText={props.setProviderInput} placeholder="codex / claude / opencode" placeholderTextColor="#6F7573" style={s.input} />
                </View>
                <View style={s.formField}>
                  <Text style={s.fieldLabel}>Working Directory</Text>
                  <TextInput value={props.cwdInput} onChangeText={props.setCwdInput} placeholder="Workspace root or custom cwd" placeholderTextColor="#6F7573" style={s.input} />
                </View>
                <View style={s.formFieldWide}>
                  <Text style={s.fieldLabel}>Initial Prompt</Text>
                  <TextInput value={props.promptInput} onChangeText={props.setPromptInput} placeholder="Create a new agent with an initial instruction" placeholderTextColor="#6F7573" style={s.input} />
                </View>
              </View>

              <View style={s.segmentedRow}>
                <Pressable style={s.segmentedChip} onPress={() => props.setAgentModeInput("chat")}>
                  <Text style={s.segmentedChipText}>Chat</Text>
                </Pressable>
                <Pressable style={s.segmentedChip} onPress={() => props.setAgentModeInput("plan")}>
                  <Text style={s.segmentedChipText}>Plan</Text>
                </Pressable>
                <Pressable style={s.segmentedChip} onPress={() => props.setAgentModeInput("auto")}>
                  <Text style={s.segmentedChipText}>Auto</Text>
                </Pressable>
                <Pressable style={s.segmentedChip} onPress={() => props.setAgentPermissionModeInput("allow")}>
                  <Text style={s.segmentedChipText}>Allow</Text>
                </Pressable>
                <Pressable style={s.segmentedChip} onPress={() => props.setAgentPermissionModeInput("ask")}>
                  <Text style={s.segmentedChipText}>Ask</Text>
                </Pressable>
                <Pressable style={s.segmentedChip} onPress={() => props.setAgentPermissionModeInput("deny")}>
                  <Text style={s.segmentedChipText}>Deny</Text>
                </Pressable>
              </View>

              <Pressable style={[s.btn, props.busy && s.btnDisabled]} onPress={() => void props.createAgent()} disabled={props.busy}>
                {props.busy ? <ActivityIndicator color="#ffffff" /> : <Text style={s.btnText}>Create Agent</Text>}
              </Pressable>
            </View>

            <View style={s.mainGrid}>
              <View style={s.stackColumn}>
                <SectionCard title="Projects and Worktrees" sub="The left rail mirrors Paseo’s workspace-driven workflow. Add a root once, then spawn worktrees from it.">
                  <View style={s.formGrid}>
                    <View style={s.formField}>
                      <Text style={s.fieldLabel}>Project Name</Text>
                      <TextInput value={props.newProjectName} onChangeText={props.setNewProjectName} placeholder="api-server" placeholderTextColor="#6F7573" style={s.input} />
                    </View>
                    <View style={s.formField}>
                      <Text style={s.fieldLabel}>Project Root</Text>
                      <TextInput value={props.newProjectRootPath} onChangeText={props.setNewProjectRootPath} placeholder="C:\\repo" placeholderTextColor="#6F7573" style={s.input} />
                    </View>
                  </View>
                  <Pressable style={[s.btn, props.busy && s.btnDisabled]} onPress={() => void props.createProject()} disabled={props.busy}>
                    <Text style={s.btnText}>Add Project</Text>
                  </Pressable>
                  <View style={s.formGrid}>
                    <View style={s.formField}>
                      <Text style={s.fieldLabel}>Worktree Name</Text>
                      <TextInput value={props.newWorkspaceName} onChangeText={props.setNewWorkspaceName} placeholder="feature-audit" placeholderTextColor="#6F7573" style={s.input} />
                    </View>
                    <View style={s.formField}>
                      <Text style={s.fieldLabel}>Branch</Text>
                      <TextInput value={props.newWorkspaceBranch} onChangeText={props.setNewWorkspaceBranch} placeholder="feature/audit" placeholderTextColor="#6F7573" style={s.input} />
                    </View>
                  </View>
                  <Pressable style={[s.iconBtn, props.busy && s.btnDisabled]} onPress={() => void props.createWorkspace()} disabled={props.busy}>
                    <Text style={s.iconBtnText}>Create Worktree</Text>
                  </Pressable>
                </SectionCard>

                <SectionCard title="Terminal" sub="Keep shell output visible in the center pane, closer to Paseo’s operator workflow than the old stacked form.">
                  <View style={s.segmentedRow}>
                    <Pressable style={s.btn} onPress={() => void props.createTerminal()}>
                      <Text style={s.btnText}>New Terminal</Text>
                    </Pressable>
                    <Pressable style={s.btnGhost} onPress={() => void props.killTerminal()} disabled={!props.selectedTerminalId}>
                      <Text style={s.ghostBtnText}>Kill Selected</Text>
                    </Pressable>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={s.segmentedRow}>
                      {props.terminals.map((terminal) => (
                        <Pressable
                          key={terminal.id}
                          style={[s.segmentedChip, props.selectedTerminalId === terminal.id && s.segmentedChipActive]}
                          onPress={() => props.selectTerminal(terminal.id)}
                        >
                          <Text style={[s.segmentedChipText, props.selectedTerminalId === terminal.id && s.segmentedChipTextActive]}>
                            {terminal.command}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                  <View style={s.terminalOutput}>
                    <ScrollView>
                      <Text style={s.terminalText}>{props.terminalOutputText || "No terminal output yet."}</Text>
                    </ScrollView>
                  </View>
                  <View style={s.inputRow}>
                    <TextInput value={props.terminalInput} onChangeText={props.setTerminalInput} placeholder="Terminal input..." placeholderTextColor="#6F7573" style={[s.input, s.inputGrow]} />
                    <Pressable style={s.iconBtn} onPress={() => void props.sendTerminalInput()}>
                      <Text style={s.iconBtnText}>Send</Text>
                    </Pressable>
                  </View>
                </SectionCard>
              </View>

              <View style={s.stackColumn}>
                <SectionCard title="Permissions and Schedules" sub="Actionable queue on top, recurring automation below.">
                  {props.pendingPermissions.length === 0 ? <Text style={s.empty}>No pending permissions.</Text> : null}
                  {props.pendingPermissions.map((permission) => (
                    <View key={permission.id} style={s.miniCard}>
                      <Text style={s.miniCardTitle}>{permission.action}</Text>
                      <Text style={s.miniCardMeta}>{permission.reason}</Text>
                      <View style={s.inputRow}>
                        <Pressable style={s.btn} onPress={() => void props.approvePermission(permission.id)}>
                          <Text style={s.btnText}>Approve</Text>
                        </Pressable>
                        <Pressable style={s.btnDanger} onPress={() => void props.denyPermission(permission.id)}>
                          <Text style={s.btnText}>Deny</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  <View style={s.formGrid}>
                    <View style={s.formField}>
                      <Text style={s.fieldLabel}>Interval</Text>
                      <TextInput value={props.scheduleIntervalInput} onChangeText={props.setScheduleIntervalInput} placeholder="300" placeholderTextColor="#6F7573" style={s.input} />
                    </View>
                    <View style={s.formFieldWide}>
                      <Text style={s.fieldLabel}>Prompt</Text>
                      <TextInput value={props.schedulePromptInput} onChangeText={props.setSchedulePromptInput} placeholder="Recurring prompt..." placeholderTextColor="#6F7573" style={s.input} />
                    </View>
                  </View>
                  <Pressable style={s.iconBtn} onPress={() => void props.createSchedule()}>
                    <Text style={s.iconBtnText}>Create Schedule</Text>
                  </Pressable>
                  {props.schedules.map((schedule) => (
                    <View key={schedule.id} style={s.miniCard}>
                      <Text style={s.miniCardTitle}>
                        {schedule.provider} every {schedule.intervalSeconds}s
                      </Text>
                      <Text style={s.miniCardMeta}>
                        {schedule.status} | next {schedule.nextRunAt}
                      </Text>
                      <View style={s.inputRow}>
                        <Pressable style={s.iconBtn} onPress={() => void props.scheduleAction(schedule.id, "run")}>
                          <Text style={s.iconBtnText}>Run</Text>
                        </Pressable>
                        <Pressable style={s.iconBtn} onPress={() => void props.scheduleAction(schedule.id, schedule.status === "active" ? "pause" : "resume")}>
                          <Text style={s.iconBtnText}>{schedule.status === "active" ? "Pause" : "Resume"}</Text>
                        </Pressable>
                        <Pressable style={s.btnDanger} onPress={() => void props.scheduleAction(schedule.id, "delete")}>
                          <Text style={s.btnText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </SectionCard>
              </View>
            </View>
          </View>

          <ScrollView style={s.rightRail}>
            <SectionCard title="MCP Servers" sub="Process orchestration stays in a dedicated right rail, similar to Paseo’s tooling side surfaces.">
              <TextInput value={props.newMcpName} onChangeText={props.setNewMcpName} placeholder="Server name" placeholderTextColor="#6F7573" style={s.input} />
              <TextInput value={props.newMcpCommand} onChangeText={props.setNewMcpCommand} placeholder="Command" placeholderTextColor="#6F7573" style={s.input} />
              <TextInput value={props.newMcpArgs} onChangeText={props.setNewMcpArgs} placeholder="Args" placeholderTextColor="#6F7573" style={s.input} />
              <Pressable style={s.btn} onPress={() => void props.createMcpServer()}>
                <Text style={s.btnText}>Add MCP Server</Text>
              </Pressable>
              {props.mcpServers.map((server) => (
                <View key={server.id} style={s.miniCard}>
                  <Text style={s.miniCardTitle}>{server.name}</Text>
                  <Text style={s.miniCardMeta}>
                    {server.status} | {server.command}
                  </Text>
                  <View style={s.inputRow}>
                    <Pressable style={s.iconBtn} onPress={() => void props.mcpAction(server.id, server.status === "running" ? "stop" : "start")}>
                      <Text style={s.iconBtnText}>{server.status === "running" ? "Stop" : "Start"}</Text>
                    </Pressable>
                    <Pressable style={s.btnDanger} onPress={() => void props.mcpAction(server.id, "remove")}>
                      <Text style={s.btnText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </SectionCard>

            <SectionCard title="Relay and Voice" sub="Secondary transport and voice controls stay visible without dominating the main workflow.">
              <Pressable style={s.btn} onPress={() => void props.createRelaySession()}>
                <Text style={s.btnText}>Open Relay Session</Text>
              </Pressable>
              {props.relaySessions.map((relaySession) => (
                <View key={relaySession.id} style={s.miniCard}>
                  <Text style={s.miniCardTitle}>{relaySession.id.slice(0, 12)}</Text>
                  <Text style={s.miniCardMeta}>
                    {relaySession.status} | {relaySession.clientName}
                  </Text>
                  {relaySession.status === "connected" ? (
                    <Pressable style={s.btnDanger} onPress={() => void props.closeRelaySession(relaySession.id)}>
                      <Text style={s.btnText}>Close</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <Pressable style={s.iconBtn} onPress={() => void props.createVoiceSession()}>
                <Text style={s.iconBtnText}>Create Voice Session</Text>
              </Pressable>
              {props.voiceSessions.map((voiceSession) => (
                <Pressable
                  key={voiceSession.id}
                  style={[s.miniCard, props.selectedVoiceSessionId === voiceSession.id && s.sidebarItemActive]}
                  onPress={() => props.selectVoiceSession(voiceSession.id)}
                >
                  <Text style={s.miniCardTitle}>{voiceSession.id.slice(0, 12)}</Text>
                  <Text style={s.miniCardMeta}>
                    {voiceSession.status} | {voiceSession.agentId ?? "no agent"}
                  </Text>
                </Pressable>
              ))}
              {props.selectedVoiceSession ? (
                <>
                  <View style={s.terminalOutput}>
                    <ScrollView>
                      <Text style={s.terminalText}>
                        {props.selectedVoiceEvents.length > 0
                          ? props.selectedVoiceEvents.map((event) => `${event.role}: ${event.text}`).join("\n")
                          : "No voice events yet."}
                      </Text>
                    </ScrollView>
                  </View>
                  <View style={s.inputRow}>
                    <TextInput value={props.voiceTextInput} onChangeText={props.setVoiceTextInput} placeholder="Voice text..." placeholderTextColor="#6F7573" style={[s.input, s.inputGrow]} />
                    <Pressable style={s.iconBtn} onPress={() => void props.sendVoiceText()}>
                      <Text style={s.iconBtnText}>Send</Text>
                    </Pressable>
                    <Pressable style={s.btnDanger} onPress={() => void props.endVoiceSession()}>
                      <Text style={s.btnText}>End</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </SectionCard>

            {props.desktopDaemonBase ? (
              <SectionCard title="Phone Pairing" sub="Copied as a secondary workflow only. Desktop remains the primary path.">
                <TextInput value={props.mobileHostInput} onChangeText={props.setMobileHostInput} placeholder="LAN IP:port" placeholderTextColor="#6F7573" style={s.input} />
                <Pressable style={[s.btn, props.mobilePairBusy && s.btnDisabled]} onPress={() => void props.createMobilePairingQr()} disabled={props.mobilePairBusy}>
                  {props.mobilePairBusy ? <ActivityIndicator color="#ffffff" /> : <Text style={s.btnText}>Generate Mobile QR</Text>}
                </Pressable>
                {props.mobilePairQr ? <Image source={{ uri: props.mobilePairQr }} style={s.qrImage} /> : null}
                {props.mobilePairUrl ? <Text style={s.qrUrl}>{props.mobilePairUrl}</Text> : null}
              </SectionCard>
            ) : null}
          </ScrollView>
        </View>

        {props.connectionError ? <Text style={s.error}>{props.connectionError}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

import { Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { AgentRecord, AgentStreamEvent } from "@gaa/protocol";
import type { ConnectionState } from "../types";
import { s } from "../styles";

export function AgentDetailScreen(props: {
  connectionState: ConnectionState;
  selectedAgent: AgentRecord;
  selectedAgentId: string;
  selectedEvents: AgentStreamEvent[];
  detailPrompt: string;
  setDetailPrompt(v: string): void;
  busy: boolean;
  sendToAgent(): Promise<void>;
  stopAgent(): Promise<void>;
  archiveAgent(): Promise<void>;
  loadAgentEvents(agentId: string): Promise<void>;
  back(): void;
  connectionError: string | null;
  statusColors: Record<string, string>;
}) {
  return (
    <SafeAreaView style={s.container}>
      <StatusBar style="light" />
      <View style={s.detailShell}>
        <View style={s.shellHeader}>
          <Pressable style={s.ghostBtn} onPress={props.back}>
            <Text style={s.ghostBtnText}>Back</Text>
          </Pressable>
          <View style={s.shellHeaderMeta}>
            <Text style={s.shellTitle}>{props.selectedAgent.title || props.selectedAgent.id.slice(0, 8)}</Text>
            <Text style={s.shellSubtitle}>
              {props.selectedAgent.provider} | {props.selectedAgent.cwd}
            </Text>
          </View>
          <View style={s.shellBadge}>
            <Text style={s.shellBadgeText}>{props.connectionState}</Text>
          </View>
        </View>

        <View style={s.detailBody}>
          <View style={s.detailRail}>
            <Text style={s.sidebarSectionTitle}>Agent</Text>
            <View style={s.sidebarItem}>
              <View style={s.agentRowTop}>
                <View style={[s.statusDot, { backgroundColor: props.statusColors[props.selectedAgent.status] ?? "#A1A5A4" }]} />
                <Text style={s.sidebarItemTitle}>{props.selectedAgent.status}</Text>
              </View>
              <Text style={s.sidebarItemMeta}>
                {props.selectedAgent.mode}/{props.selectedAgent.permissionMode}
              </Text>
              <Text style={s.sidebarItemPath}>{props.selectedAgent.id}</Text>
            </View>

            <Text style={s.sidebarSectionTitle}>Actions</Text>
            <Pressable style={s.btnGhost} onPress={() => void props.loadAgentEvents(props.selectedAgentId)}>
              <Text style={s.ghostBtnText}>Refresh Timeline</Text>
            </Pressable>
            <Pressable style={s.btnDanger} onPress={() => void props.stopAgent()} disabled={props.busy}>
              <Text style={s.btnText}>Stop Agent</Text>
            </Pressable>
            <Pressable style={s.btnGhost} onPress={() => void props.archiveAgent()} disabled={props.busy}>
              <Text style={s.ghostBtnText}>Archive Agent</Text>
            </Pressable>
          </View>

          <View style={s.detailMain}>
            <View style={s.panelHeader}>
              <View style={s.panelHeaderStack}>
                <Text style={s.panelTitle}>Timeline</Text>
                <Text style={s.panelSub}>A denser operator view aligned with Paseo’s main-session reading pattern.</Text>
              </View>
            </View>

            <View style={[s.terminalOutput, { flex: 1, maxHeight: undefined }]}>
              <ScrollView>
                {props.selectedEvents.length === 0 ? <Text style={s.empty}>No stream events yet.</Text> : null}
                {props.selectedEvents.map((item) => (
                  <View key={item.id} style={s.event}>
                    <Text style={s.eventSeq}>#{item.seq}</Text>
                    <View style={s.eventBody}>
                      <Text style={s.eventType}>{item.eventType}</Text>
                      <Text style={s.eventText}>{item.text}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>

            <View style={s.formFieldWide}>
              <Text style={s.fieldLabel}>Follow-Up Prompt</Text>
              <TextInput value={props.detailPrompt} onChangeText={props.setDetailPrompt} placeholder="Send follow-up..." placeholderTextColor="#6F7573" style={s.input} />
            </View>
            <View style={s.inputRow}>
              <Pressable style={s.btn} onPress={() => void props.sendToAgent()} disabled={props.busy}>
                <Text style={s.btnText}>Send</Text>
              </Pressable>
              <Pressable style={s.iconBtn} onPress={() => void props.loadAgentEvents(props.selectedAgentId)}>
                <Text style={s.iconBtnText}>Reload</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {props.connectionError ? <Text style={s.error}>{props.connectionError}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

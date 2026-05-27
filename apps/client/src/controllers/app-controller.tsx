import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { wsToHttpBase } from "../api/daemon-client";
import { requestId } from "../realtime/ws-client";
import { clearSession, loadSession as loadStoredSession, saveSession as saveStoredSession } from "../state/session-store";

import type {
  AgentRecord,
  AgentStreamEvent,
  McpServerRecord,
  PairingOffer,
  PermissionRequestRecord,
  ProjectRecord,
  RelaySessionRecord,
  ScheduleRecord,
  TerminalOutputEvent,
  TerminalRecord,
  VoiceChunkEvent,
  VoiceSessionRecord,
  WorkspaceRecord,
  WsEnvelope,
} from "@gaa/protocol";
import { decodePairingOfferFragment, PairingOfferSchema } from "@gaa/protocol";
import { AgentDetailScreen } from "../screens/AgentDetailScreen";
import { AgentsHomeScreen } from "../screens/AgentsHomeScreen";
import { PairScreen } from "../screens/PairScreen";
import type {
  AgentMap,
  ClientSession,
  ConnectionState,
  EventMap,
  McpServerMap,
  PermissionMap,
  ProjectMap,
  RelaySessionMap,
  ScheduleMap,
  TerminalMap,
  TerminalOutputMap,
  VoiceEventMap,
  VoiceSessionMap,
  WorkspaceMap,
} from "../types";


const BRAND_LOGO = require("../../assets/logo-gaa-white.svg");


function extractOfferPayload(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Pairing value is empty");
  const hashIndex = trimmed.indexOf("#");
  if (hashIndex >= 0) {
    const hash = trimmed.slice(hashIndex + 1);
    for (const part of hash.split("&")) {
      if (part.startsWith("offer=")) return part.slice("offer=".length);
    }
  }
  if (trimmed.startsWith("offer=")) return trimmed.slice("offer=".length);
  return trimmed;
}

function getDesktopDaemonBase(): string | null {
  const base = (globalThis as { __GAA_DAEMON_HTTP_BASE__?: unknown }).__GAA_DAEMON_HTTP_BASE__;
  if (typeof base !== "string") return null;
  const trimmed = base.trim().replace(/\/$/, "");
  return trimmed.length > 0 ? trimmed : null;
}

function decodeBase64(input: string): string {
  const NodeBuffer = (globalThis as { Buffer?: { from(input: string, encoding: string): { toString(encoding: string): string } } }).Buffer;
  if (NodeBuffer) {
    return NodeBuffer.from(input, "base64").toString("utf8");
  }
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function decodeTerminalEventChunk(event: TerminalOutputEvent): string {
  if (event.encoding === "base64") return decodeBase64(event.chunk);
  return event.chunk;
}

const STATUS_COLORS: Record<string, string> = {
  initializing: "#fbbf24",
  running: "#22d55e",
  idle: "#94a3b8",
  error: "#ef4444",
  stopped: "#64748b",
  archived: "#475569",
};

export function AppController(): JSX.Element {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pairInput, setPairInput] = useState("");
  const [localDaemonBase, setLocalDaemonBase] = useState(() => getDesktopDaemonBase() ?? "http://127.0.0.1:9777");
  const [clientName, setClientName] = useState("phone-client");
  const [isPairing, setIsPairing] = useState(false);
  const [agents, setAgents] = useState<AgentMap>({});
  const [projects, setProjects] = useState<ProjectMap>({});
  const [workspaces, setWorkspaces] = useState<WorkspaceMap>({});
  const [terminals, setTerminals] = useState<TerminalMap>({});
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [schedules, setSchedules] = useState<ScheduleMap>({});
  const [mcpServers, setMcpServers] = useState<McpServerMap>({});
  const [relaySessions, setRelaySessions] = useState<RelaySessionMap>({});
  const [voiceSessions, setVoiceSessions] = useState<VoiceSessionMap>({});
  const [eventsByAgent, setEventsByAgent] = useState<EventMap>({});
  const [terminalEventsById, setTerminalEventsById] = useState<TerminalOutputMap>({});
  const [voiceEventsBySession, setVoiceEventsBySession] = useState<VoiceEventMap>({});
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const [selectedVoiceSessionId, setSelectedVoiceSessionId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [providerInput, setProviderInput] = useState("codex");
  const [agentModeInput, setAgentModeInput] = useState<"chat" | "plan" | "auto">("chat");
  const [agentPermissionModeInput, setAgentPermissionModeInput] = useState<"allow" | "ask" | "deny">("allow");
  const [cwdInput, setCwdInput] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [detailPrompt, setDetailPrompt] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectRootPath, setNewProjectRootPath] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceBranch, setNewWorkspaceBranch] = useState("");
  const [terminalInput, setTerminalInput] = useState("");
  const [scheduleIntervalInput, setScheduleIntervalInput] = useState("300");
  const [schedulePromptInput, setSchedulePromptInput] = useState("");
  const [newMcpName, setNewMcpName] = useState("");
  const [newMcpCommand, setNewMcpCommand] = useState("");
  const [newMcpArgs, setNewMcpArgs] = useState("");
  const [voiceTextInput, setVoiceTextInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoPairAttempted, setAutoPairAttempted] = useState(false);
  const [mobileHostInput, setMobileHostInput] = useState("");
  const [mobilePairQr, setMobilePairQr] = useState<string | null>(null);
  const [mobilePairUrl, setMobilePairUrl] = useState<string | null>(null);
  const [mobilePairBusy, setMobilePairBusy] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSessionRef = useRef<ClientSession | null>(null);
  const desktopDaemonBase = getDesktopDaemonBase();

  useEffect(() => {
    if (!desktopDaemonBase) return;
    setLocalDaemonBase((current) => (current.trim().length > 0 ? current : desktopDaemonBase));
  }, [desktopDaemonBase]);

  useEffect(() => {
    void (async () => {
      const parsed = await loadStoredSession();
      if (!parsed) return;
      setSession(parsed);
      liveSessionRef.current = parsed;
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash.includes("offer=")) return;
    const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    setPairInput(fragment);
  }, []);

  useEffect(() => {
    liveSessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
    const connect = () => {
      if (stopped) return;
      const activeSession = liveSessionRef.current;
      if (!activeSession) return;
      setConnectionState(reconnectAttemptRef.current === 0 ? "connecting" : "reconnecting");
      const socket = new WebSocket(activeSession.wsEndpoint);
      wsRef.current = socket;
      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionError(null);
        socket.send(
          JSON.stringify({
            type: "hello",
            requestId: requestId(),
            payload: { authToken: activeSession.authToken, clientName },
          } satisfies WsEnvelope),
        );
      };
      socket.onmessage = (message) => {
        try {
          const envelope = JSON.parse(String(message.data)) as WsEnvelope;
          if (envelope.type === "welcome") {
            const payload = envelope.payload as {
              agents: AgentRecord[];
              projects: ProjectRecord[];
              workspaces: WorkspaceRecord[];
              terminals: TerminalRecord[];
              permissions: PermissionRequestRecord[];
              schedules: ScheduleRecord[];
              mcpServers: McpServerRecord[];
              relaySessions: RelaySessionRecord[];
              voiceSessions: VoiceSessionRecord[];
            };
            const nextAgents: AgentMap = {};
            const nextProjects: ProjectMap = {};
            const nextWorkspaces: WorkspaceMap = {};
            const nextTerminals: TerminalMap = {};
            const nextPermissions: PermissionMap = {};
            const nextSchedules: ScheduleMap = {};
            const nextMcpServers: McpServerMap = {};
            const nextRelaySessions: RelaySessionMap = {};
            const nextVoiceSessions: VoiceSessionMap = {};
            for (const agent of payload.agents) nextAgents[agent.id] = agent;
            for (const project of payload.projects) nextProjects[project.id] = project;
            for (const workspace of payload.workspaces) nextWorkspaces[workspace.id] = workspace;
            for (const terminal of payload.terminals) nextTerminals[terminal.id] = terminal;
            for (const permission of payload.permissions) nextPermissions[permission.id] = permission;
            for (const schedule of payload.schedules) nextSchedules[schedule.id] = schedule;
            for (const server of payload.mcpServers) nextMcpServers[server.id] = server;
            for (const relaySession of payload.relaySessions) nextRelaySessions[relaySession.id] = relaySession;
            for (const voiceSession of payload.voiceSessions) nextVoiceSessions[voiceSession.id] = voiceSession;
            setAgents(nextAgents);
            setProjects(nextProjects);
            setWorkspaces(nextWorkspaces);
            setTerminals(nextTerminals);
            setPermissions(nextPermissions);
            setSchedules(nextSchedules);
            setMcpServers(nextMcpServers);
            setRelaySessions(nextRelaySessions);
            setVoiceSessions(nextVoiceSessions);
            setConnectionState("connected");
            return;
          }
          if (envelope.type === "agent_update") {
            const payload = envelope.payload as { agent: AgentRecord };
            setAgents((prev) => ({ ...prev, [payload.agent.id]: payload.agent }));
            return;
          }
          if (envelope.type === "agent_stream") {
            const payload = envelope.payload as { agentId: string; event: AgentStreamEvent };
            setEventsByAgent((prev) => ({ ...prev, [payload.agentId]: [...(prev[payload.agentId] ?? []), payload.event] }));
            return;
          }
          if (envelope.type === "project_update") {
            const payload = envelope.payload as { project: ProjectRecord };
            setProjects((prev) => ({ ...prev, [payload.project.id]: payload.project }));
            return;
          }
          if (envelope.type === "workspace_update") {
            const payload = envelope.payload as { workspace: WorkspaceRecord };
            setWorkspaces((prev) => ({ ...prev, [payload.workspace.id]: payload.workspace }));
            return;
          }
          if (envelope.type === "terminal_update") {
            const payload = envelope.payload as { terminal: TerminalRecord };
            setTerminals((prev) => ({ ...prev, [payload.terminal.id]: payload.terminal }));
            return;
          }
          if (envelope.type === "terminal_output") {
            const payload = envelope.payload as { event: TerminalOutputEvent };
            setTerminalEventsById((prev) => ({
              ...prev,
              [payload.event.terminalId]: [...(prev[payload.event.terminalId] ?? []), payload.event].slice(-2000),
            }));
            return;
          }
          if (envelope.type === "permission_update") {
            const payload = envelope.payload as { permission: PermissionRequestRecord };
            setPermissions((prev) => ({ ...prev, [payload.permission.id]: payload.permission }));
            return;
          }
          if (envelope.type === "schedule_update") {
            const payload = envelope.payload as { schedule: ScheduleRecord };
            setSchedules((prev) => ({ ...prev, [payload.schedule.id]: payload.schedule }));
            return;
          }
          if (envelope.type === "mcp_server_update") {
            const payload = envelope.payload as { server: McpServerRecord };
            setMcpServers((prev) => ({ ...prev, [payload.server.id]: payload.server }));
            return;
          }
          if (envelope.type === "relay_session_update") {
            const payload = envelope.payload as { relaySession: RelaySessionRecord };
            setRelaySessions((prev) => ({ ...prev, [payload.relaySession.id]: payload.relaySession }));
            return;
          }
          if (envelope.type === "voice_session_update") {
            const payload = envelope.payload as { voiceSession: VoiceSessionRecord };
            setVoiceSessions((prev) => ({ ...prev, [payload.voiceSession.id]: payload.voiceSession }));
            return;
          }
          if (envelope.type === "voice_chunk") {
            const payload = envelope.payload as { event: VoiceChunkEvent };
            setVoiceEventsBySession((prev) => ({
              ...prev,
              [payload.event.voiceSessionId]: [...(prev[payload.event.voiceSessionId] ?? []), payload.event].slice(-2000),
            }));
            return;
          }
          if (envelope.type === "error") {
            const payload = envelope.payload as { message?: string };
            setConnectionError(payload.message ?? "Unknown server error");
          }
        } catch (error) {
          setConnectionError(error instanceof Error ? error.message : "Failed to parse server message");
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        setConnectionState("reconnecting");
        reconnectAttemptRef.current += 1;
        const delay = Math.min(5000, 300 + reconnectAttemptRef.current * 500);
        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
      socket.onerror = () => setConnectionError("WebSocket transport error");
    };
    connect();
    return () => {
      stopped = true;
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnectionState("disconnected");
    };
  }, [session, clientName]);

  const sortedAgents = useMemo(() => Object.values(agents).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [agents]);
  const sortedProjects = useMemo(() => Object.values(projects).sort((a, b) => a.name.localeCompare(b.name)), [projects]);
  const sortedWorkspaces = useMemo(() => Object.values(workspaces).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [workspaces]);
  const sortedTerminals = useMemo(() => Object.values(terminals).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [terminals]);
  const sortedPermissions = useMemo(() => Object.values(permissions).sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt)), [permissions]);
  const sortedSchedules = useMemo(() => Object.values(schedules).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [schedules]);
  const sortedMcpServers = useMemo(() => Object.values(mcpServers).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [mcpServers]);
  const sortedRelaySessions = useMemo(() => Object.values(relaySessions).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [relaySessions]);
  const sortedVoiceSessions = useMemo(() => Object.values(voiceSessions).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [voiceSessions]);
  const selectedAgent = selectedAgentId ? agents[selectedAgentId] ?? null : null;
  const selectedEvents = selectedAgentId ? eventsByAgent[selectedAgentId] ?? [] : [];
  const selectedWorkspace = selectedWorkspaceId ? workspaces[selectedWorkspaceId] ?? null : null;
  const selectedVoiceSession = selectedVoiceSessionId ? voiceSessions[selectedVoiceSessionId] ?? null : null;
  const selectedVoiceEvents = selectedVoiceSessionId ? voiceEventsBySession[selectedVoiceSessionId] ?? [] : [];
  const terminalOutputText = useMemo(() => {
    if (!selectedTerminalId) return "";
    return (terminalEventsById[selectedTerminalId] ?? []).map((event) => decodeTerminalEventChunk(event)).join("");
  }, [selectedTerminalId, terminalEventsById]);
  const visibleAgents = useMemo(
    () => (selectedWorkspaceId ? sortedAgents.filter((agent) => agent.workspaceId === selectedWorkspaceId) : sortedAgents),
    [selectedWorkspaceId, sortedAgents],
  );
  const projectNameById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const project of sortedProjects) next[project.id] = project.name;
    return next;
  }, [sortedProjects]);
  const pendingPermissions = useMemo(
    () => sortedPermissions.filter((permission) => permission.status === "pending"),
    [sortedPermissions],
  );

  useEffect(() => {
    if (selectedWorkspaceId && workspaces[selectedWorkspaceId]) return;
    const first = sortedWorkspaces[0];
    if (first) {
      setSelectedWorkspaceId(first.id);
      if (!cwdInput) setCwdInput(first.rootPath);
    }
  }, [cwdInput, selectedWorkspaceId, sortedWorkspaces, workspaces]);

  const sendEnvelope = (envelope: WsEnvelope): void => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== 1) throw new Error("Socket disconnected");
    socket.send(JSON.stringify(envelope));
  };

  const createSessionFromOffer = async (offer: PairingOffer, redeemClientName: string, httpBaseOverride?: string): Promise<ClientSession> => {
    if (Date.parse(offer.expiresAt) < Date.now()) throw new Error("Pairing offer expired");
    const httpBase = httpBaseOverride ?? wsToHttpBase(offer.wsEndpoint);
    const response = await fetch(httpBase + "/pairing/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingToken: offer.pairingToken, clientName: redeemClientName.trim() || "phone-client" }),
    });
    const body = (await response.json()) as { ok: boolean; authToken?: string; serverId?: string; wsEndpoint?: string; message?: string };
    if (!response.ok || !body.ok || !body.authToken || !body.serverId || !body.wsEndpoint) throw new Error(body.message ?? "Pairing redeem failed");
    return { authToken: body.authToken, serverId: body.serverId, wsEndpoint: body.wsEndpoint, httpBaseUrl: wsToHttpBase(body.wsEndpoint) };
  };

  useEffect(() => {
    if (session || !desktopDaemonBase || autoPairAttempted || isPairing) return;
    let cancelled = false;
    setAutoPairAttempted(true);
    setIsPairing(true);
    setConnectionError(null);
    void (async () => {
      try {
        const daemonUrl = new URL(desktopDaemonBase);
        const offerResponse = await fetch(desktopDaemonBase + "/pairing/offer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestHost: daemonUrl.host }),
        });
        const offerBody = (await offerResponse.json()) as { offer?: PairingOffer; message?: string };
        if (!offerResponse.ok || !offerBody.offer) throw new Error(offerBody.message ?? "Failed to create desktop pairing offer");
        const offer = PairingOfferSchema.parse(offerBody.offer);
        const nextSession = await createSessionFromOffer(offer, "desktop-client", desktopDaemonBase);
        if (cancelled) return;
        await saveStoredSession(nextSession);
        setSession(nextSession);
        setPairInput("");
        resetRuntimeState();
      } catch (error) {
        if (!cancelled) setConnectionError(error instanceof Error ? error.message : "Desktop auto-pair failed");
      } finally {
        if (!cancelled) setIsPairing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPairAttempted, desktopDaemonBase, isPairing, session]);

  const resetRuntimeState = (): void => {
    setProjects({});
    setWorkspaces({});
    setTerminals({});
    setPermissions({});
    setSchedules({});
    setMcpServers({});
    setRelaySessions({});
    setVoiceSessions({});
    setTerminalEventsById({});
    setVoiceEventsBySession({});
    setSelectedTerminalId(null);
    setSelectedVoiceSessionId(null);
    setSelectedWorkspaceId(null);
    setSelectedAgentId(null);
    setAgents({});
    setEventsByAgent({});
  };

  const pair = async (): Promise<void> => {
    setIsPairing(true);
    setConnectionError(null);
    try {
      const offer = decodePairingOfferFragment(extractOfferPayload(pairInput));
      const nextSession = await createSessionFromOffer(offer, clientName);
      await saveStoredSession(nextSession);
      setSession(nextSession);
      setPairInput("");
      resetRuntimeState();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Pairing failed");
    } finally {
      setIsPairing(false);
    }
  };

  const pairLocal = async (): Promise<void> => {
    setIsPairing(true);
    setConnectionError(null);
    try {
      const base = localDaemonBase.trim().replace(/\/$/, "");
      if (!base) throw new Error("Local daemon base URL is required");
      const daemonUrl = new URL(base);
      const offerResponse = await fetch(base + "/pairing/offer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestHost: daemonUrl.host }),
      });
      const offerBody = (await offerResponse.json()) as { offer?: PairingOffer; message?: string };
      if (!offerResponse.ok || !offerBody.offer) throw new Error(offerBody.message ?? "Failed to create pairing offer");
      const offer = PairingOfferSchema.parse(offerBody.offer);
      const nextSession = await createSessionFromOffer(offer, clientName, base);
      await saveStoredSession(nextSession);
      setSession(nextSession);
      setPairInput("");
      resetRuntimeState();
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Local pairing failed");
    } finally {
      setIsPairing(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    await clearSession();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setSession(null);
    resetRuntimeState();
    setConnectionState("disconnected");
    setConnectionError(null);
  };

  const createAgent = async (): Promise<void> => {
    const effectiveCwd = cwdInput.trim() || selectedWorkspace?.rootPath || "";
    if (!effectiveCwd) {
      setConnectionError("Select a workspace or provide a working directory");
      return;
    }
    setBusy(true);
    try {
      sendEnvelope({
        type: "agent_create",
        requestId: requestId(),
        payload: {
          provider: providerInput.trim(),
          cwd: effectiveCwd,
          prompt: promptInput.trim() || undefined,
          workspaceId: selectedWorkspace?.id ?? undefined,
          mode: agentModeInput,
          permissionMode: agentPermissionModeInput,
        },
      });
      setPromptInput("");
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to send create command");
    } finally {
      setBusy(false);
    }
  };

  const createProject = async (): Promise<void> => {
    if (!session) return;
    setBusy(true);
    setConnectionError(null);
    try {
      const response = await fetch(session.httpBaseUrl + "/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.authToken}`,
        },
        body: JSON.stringify({
          name: newProjectName.trim(),
          rootPath: newProjectRootPath.trim(),
        }),
      });
      const body = (await response.json()) as { project?: ProjectRecord; workspace?: WorkspaceRecord; message?: string };
      if (!response.ok || !body.project || !body.workspace) {
        throw new Error(body.message ?? "Failed to create project");
      }
      setProjects((prev) => ({ ...prev, [body.project!.id]: body.project! }));
      setWorkspaces((prev) => ({ ...prev, [body.workspace!.id]: body.workspace! }));
      setSelectedWorkspaceId(body.workspace.id);
      setCwdInput(body.workspace.rootPath);
      setNewProjectName("");
      setNewProjectRootPath("");
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to create project");
    } finally {
      setBusy(false);
    }
  };

  const createWorkspace = async (): Promise<void> => {
    if (!session) return;
    const projectId = selectedWorkspace?.projectId ?? sortedProjects[0]?.id;
    if (!projectId) {
      setConnectionError("Create a project first");
      return;
    }
    setBusy(true);
    setConnectionError(null);
    try {
      const response = await fetch(session.httpBaseUrl + "/workspaces", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.authToken}`,
        },
        body: JSON.stringify({
          projectId,
          name: newWorkspaceName.trim(),
          kind: "worktree",
          branch: newWorkspaceBranch.trim() || undefined,
        }),
      });
      const body = (await response.json()) as { workspace?: WorkspaceRecord; message?: string };
      if (!response.ok || !body.workspace) {
        throw new Error(body.message ?? "Failed to create workspace");
      }
      setWorkspaces((prev) => ({ ...prev, [body.workspace!.id]: body.workspace! }));
      setSelectedWorkspaceId(body.workspace.id);
      setCwdInput(body.workspace.rootPath);
      setNewWorkspaceName("");
      setNewWorkspaceBranch("");
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to create workspace");
    } finally {
      setBusy(false);
    }
  };

  const loadTerminalOutput = async (terminalId: string): Promise<void> => {
    if (!session) return;
    try {
      const response = await fetch(session.httpBaseUrl + `/terminals/${terminalId}/output?limit=1200`, {
        headers: { authorization: `Bearer ${session.authToken}` },
      });
      const body = (await response.json()) as { events?: TerminalOutputEvent[]; message?: string };
      if (!response.ok || !body.events) {
        throw new Error(body.message ?? "Failed to load terminal output");
      }
      setTerminalEventsById((prev) => ({ ...prev, [terminalId]: body.events! }));
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to load terminal output");
    }
  };

  const createTerminal = async (): Promise<void> => {
    if (!session) return;
    setBusy(true);
    setConnectionError(null);
    try {
      const response = await fetch(session.httpBaseUrl + "/terminals", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.authToken}`,
        },
        body: JSON.stringify({
          workspaceId: selectedWorkspace?.id ?? undefined,
          cwd: selectedWorkspace?.rootPath ?? (cwdInput.trim() || "."),
        }),
      });
      const body = (await response.json()) as { terminal?: TerminalRecord; message?: string };
      if (!response.ok || !body.terminal) {
        throw new Error(body.message ?? "Failed to create terminal");
      }
      setTerminals((prev) => ({ ...prev, [body.terminal!.id]: body.terminal! }));
      setSelectedTerminalId(body.terminal.id);
      setTerminalInput("");
      await loadTerminalOutput(body.terminal.id);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to create terminal");
    } finally {
      setBusy(false);
    }
  };

  const sendTerminalInput = async (): Promise<void> => {
    if (!session || !selectedTerminalId) return;
    if (!terminalInput) return;
    setBusy(true);
    try {
      const response = await fetch(session.httpBaseUrl + `/terminals/${selectedTerminalId}/input`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.authToken}`,
        },
        body: JSON.stringify({ input: terminalInput }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "Failed to send terminal input");
      }
      setTerminalInput("");
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to send terminal input");
    } finally {
      setBusy(false);
    }
  };

  const killTerminal = async (): Promise<void> => {
    if (!session || !selectedTerminalId) return;
    setBusy(true);
    try {
      const response = await fetch(session.httpBaseUrl + `/terminals/${selectedTerminalId}/kill`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.authToken}` },
      });
      const body = (await response.json()) as { terminal?: TerminalRecord; message?: string };
      if (!response.ok || !body.terminal) {
        throw new Error(body.message ?? "Failed to kill terminal");
      }
      setTerminals((prev) => ({ ...prev, [body.terminal!.id]: body.terminal! }));
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to kill terminal");
    } finally {
      setBusy(false);
    }
  };

  const loadAgentEvents = async (agentId: string): Promise<void> => {
    if (!session) return;
    try {
      const response = await fetch(session.httpBaseUrl + "/agents/" + agentId + "/events?limit=800", {
        headers: { authorization: `Bearer ${session.authToken}` },
      });
      if (!response.ok) throw new Error("Event fetch failed with " + response.status);
      const body = (await response.json()) as { events: AgentStreamEvent[] };
      const dedup = new Map<number, AgentStreamEvent>();
      for (const event of body.events) dedup.set(event.seq, event);
      setEventsByAgent((prev) => ({ ...prev, [agentId]: Array.from(dedup.values()).sort((a, b) => a.seq - b.seq) }));
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to fetch timeline");
    }
  };

  const sendToAgent = async (): Promise<void> => {
    if (!selectedAgentId || !detailPrompt.trim()) return;
    setBusy(true);
    try {
      sendEnvelope({ type: "agent_send", requestId: requestId(), payload: { agentId: selectedAgentId, prompt: detailPrompt.trim() } });
      setDetailPrompt("");
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to send follow-up");
    } finally {
      setBusy(false);
    }
  };

  const stopAgent = async (): Promise<void> => {
    if (!selectedAgentId) return;
    setBusy(true);
    try {
      sendEnvelope({ type: "agent_stop", requestId: requestId(), payload: { agentId: selectedAgentId } });
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to stop agent");
    } finally {
      setBusy(false);
    }
  };

  const archiveAgent = async (): Promise<void> => {
    if (!selectedAgentId) return;
    setBusy(true);
    try {
      sendEnvelope({ type: "agent_archive", requestId: requestId(), payload: { agentId: selectedAgentId } });
      setSelectedAgentId(null);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to archive agent");
    } finally {
      setBusy(false);
    }
  };

  const approvePermission = async (permissionId: string): Promise<void> => {
    if (!session) return;
    try {
      const response = await fetch(session.httpBaseUrl + `/permissions/${permissionId}/approve`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.authToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const body = (await response.json()) as { permission?: PermissionRequestRecord; message?: string };
      if (!response.ok || !body.permission) throw new Error(body.message ?? "Failed to approve permission");
      setPermissions((prev) => ({ ...prev, [body.permission!.id]: body.permission! }));
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to approve permission");
    }
  };

  const denyPermission = async (permissionId: string): Promise<void> => {
    if (!session) return;
    try {
      const response = await fetch(session.httpBaseUrl + `/permissions/${permissionId}/deny`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.authToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const body = (await response.json()) as { permission?: PermissionRequestRecord; message?: string };
      if (!response.ok || !body.permission) throw new Error(body.message ?? "Failed to deny permission");
      setPermissions((prev) => ({ ...prev, [body.permission!.id]: body.permission! }));
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to deny permission");
    }
  };

  const createSchedule = async (): Promise<void> => {
    if (!session) return;
    const intervalSeconds = Number(scheduleIntervalInput.trim());
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      setConnectionError("Schedule interval must be a positive number");
      return;
    }
    if (!schedulePromptInput.trim()) {
      setConnectionError("Schedule prompt is required");
      return;
    }
    const effectiveCwd = selectedWorkspace?.rootPath ?? cwdInput.trim();
    if (!effectiveCwd) {
      setConnectionError("Select a workspace or set cwd before creating schedule");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(session.httpBaseUrl + "/schedules", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.authToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: selectedWorkspace?.id ?? undefined,
          provider: providerInput.trim() || "codex",
          cwd: effectiveCwd,
          prompt: schedulePromptInput.trim(),
          intervalSeconds,
        }),
      });
      const body = (await response.json()) as { schedule?: ScheduleRecord; message?: string };
      if (!response.ok || !body.schedule) throw new Error(body.message ?? "Failed to create schedule");
      setSchedules((prev) => ({ ...prev, [body.schedule!.id]: body.schedule! }));
      setSchedulePromptInput("");
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to create schedule");
    } finally {
      setBusy(false);
    }
  };

  const scheduleAction = async (scheduleId: string, action: "pause" | "resume" | "run" | "delete"): Promise<void> => {
    if (!session) return;
    try {
      const url =
        action === "pause"
          ? `/schedules/${scheduleId}/pause`
          : action === "resume"
            ? `/schedules/${scheduleId}/resume`
            : action === "run"
              ? `/schedules/${scheduleId}/run`
              : `/schedules/${scheduleId}`;
      const method = action === "delete" ? "DELETE" : "POST";
      const response = await fetch(session.httpBaseUrl + url, {
        method,
        headers: {
          authorization: `Bearer ${session.authToken}`,
          "content-type": "application/json",
        },
      });
      const body = (await response.json()) as { schedule?: ScheduleRecord; message?: string; ok?: boolean };
      if (!response.ok) throw new Error(body.message ?? "Schedule operation failed");
      if (action === "delete") {
        setSchedules((prev) => {
          const next = { ...prev };
          delete next[scheduleId];
          return next;
        });
      } else if (body.schedule) {
        setSchedules((prev) => ({ ...prev, [body.schedule!.id]: body.schedule! }));
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed schedule operation");
    }
  };

  const createMcpServer = async (): Promise<void> => {
    if (!session) return;
    if (!newMcpName.trim() || !newMcpCommand.trim()) {
      setConnectionError("MCP name and command are required");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(session.httpBaseUrl + "/mcp/servers", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.authToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: newMcpName.trim(),
          command: newMcpCommand.trim(),
          args: newMcpArgs
            .split(" ")
            .map((part) => part.trim())
            .filter((part) => part.length > 0),
        }),
      });
      const body = (await response.json()) as { server?: McpServerRecord; message?: string };
      if (!response.ok || !body.server) throw new Error(body.message ?? "Failed to create MCP server");
      setMcpServers((prev) => ({ ...prev, [body.server!.id]: body.server! }));
      setNewMcpName("");
      setNewMcpCommand("");
      setNewMcpArgs("");
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to create MCP server");
    } finally {
      setBusy(false);
    }
  };

  const mcpAction = async (serverId: string, action: "start" | "stop" | "remove"): Promise<void> => {
    if (!session) return;
    try {
      const path = action === "remove" ? `/mcp/servers/${serverId}` : `/mcp/servers/${serverId}/${action}`;
      const method = action === "remove" ? "DELETE" : "POST";
      const response = await fetch(session.httpBaseUrl + path, {
        method,
        headers: {
          authorization: `Bearer ${session.authToken}`,
          "content-type": "application/json",
        },
      });
      const body = (await response.json()) as { server?: McpServerRecord; message?: string };
      if (!response.ok) throw new Error(body.message ?? "MCP action failed");
      if (action === "remove") {
        setMcpServers((prev) => {
          const next = { ...prev };
          delete next[serverId];
          return next;
        });
      } else if (body.server) {
        setMcpServers((prev) => ({ ...prev, [body.server!.id]: body.server! }));
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed MCP action");
    }
  };

  const createRelaySession = async (): Promise<void> => {
    if (!session) return;
    try {
      const response = await fetch(session.httpBaseUrl + "/relay/sessions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.authToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ clientName: "client-relay" }),
      });
      const body = (await response.json()) as { relaySession?: RelaySessionRecord; message?: string };
      if (!response.ok || !body.relaySession) throw new Error(body.message ?? "Failed to create relay session");
      setRelaySessions((prev) => ({ ...prev, [body.relaySession!.id]: body.relaySession! }));
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to create relay session");
    }
  };

  const closeRelaySession = async (relaySessionId: string): Promise<void> => {
    if (!session) return;
    try {
      const response = await fetch(session.httpBaseUrl + `/relay/sessions/${relaySessionId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${session.authToken}` },
      });
      const body = (await response.json()) as { relaySession?: RelaySessionRecord; message?: string };
      if (!response.ok || !body.relaySession) throw new Error(body.message ?? "Failed to close relay session");
      setRelaySessions((prev) => ({ ...prev, [body.relaySession!.id]: body.relaySession! }));
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to close relay session");
    }
  };

  const createVoiceSession = async (): Promise<void> => {
    if (!session) return;
    try {
      const response = await fetch(session.httpBaseUrl + "/voice/sessions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.authToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: selectedWorkspace?.id ?? undefined,
          agentId: selectedAgentId ?? undefined,
        }),
      });
      const body = (await response.json()) as { voiceSession?: VoiceSessionRecord; message?: string };
      if (!response.ok || !body.voiceSession) throw new Error(body.message ?? "Failed to create voice session");
      setVoiceSessions((prev) => ({ ...prev, [body.voiceSession!.id]: body.voiceSession! }));
      setSelectedVoiceSessionId(body.voiceSession.id);
      void loadVoiceEvents(body.voiceSession.id);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to create voice session");
    }
  };

  const loadVoiceEvents = async (voiceSessionId: string): Promise<void> => {
    if (!session) return;
    try {
      const response = await fetch(session.httpBaseUrl + `/voice/sessions/${voiceSessionId}/events?limit=400`, {
        headers: { authorization: `Bearer ${session.authToken}` },
      });
      const body = (await response.json()) as { events?: VoiceChunkEvent[]; message?: string };
      if (!response.ok || !body.events) throw new Error(body.message ?? "Failed to load voice events");
      setVoiceEventsBySession((prev) => ({ ...prev, [voiceSessionId]: body.events! }));
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to load voice events");
    }
  };

  const sendVoiceText = async (): Promise<void> => {
    if (!session || !selectedVoiceSessionId) return;
    if (!voiceTextInput.trim()) return;
    try {
      const response = await fetch(session.httpBaseUrl + `/voice/sessions/${selectedVoiceSessionId}/chunk`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.authToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: voiceTextInput.trim(),
          sendToAgent: true,
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(body.message ?? "Failed to send voice text");
      }
      setVoiceTextInput("");
      await loadVoiceEvents(selectedVoiceSessionId);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to send voice text");
    }
  };

  const endVoiceSession = async (): Promise<void> => {
    if (!session || !selectedVoiceSessionId) return;
    try {
      const response = await fetch(session.httpBaseUrl + `/voice/sessions/${selectedVoiceSessionId}/end`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.authToken}` },
      });
      const body = (await response.json()) as { voiceSession?: VoiceSessionRecord; message?: string };
      if (!response.ok || !body.voiceSession) throw new Error(body.message ?? "Failed to end voice session");
      setVoiceSessions((prev) => ({ ...prev, [body.voiceSession!.id]: body.voiceSession! }));
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to end voice session");
    }
  };

  const createMobilePairingQr = async (): Promise<void> => {
    if (!desktopDaemonBase) {
      setConnectionError("Desktop daemon base unavailable");
      return;
    }
    setMobilePairBusy(true);
    setConnectionError(null);
    try {
      const daemonUrl = new URL(desktopDaemonBase);
      const requestHost = mobileHostInput.trim().length > 0 ? mobileHostInput.trim() : daemonUrl.host;
      const response = await fetch(desktopDaemonBase + "/pairing/offer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestHost }),
      });
      const body = (await response.json()) as { qr?: string; url?: string; message?: string };
      if (!response.ok || !body.qr || !body.url) throw new Error(body.message ?? "Failed to create mobile pairing QR");
      setMobilePairQr(body.qr);
      setMobilePairUrl(body.url);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to create mobile pairing QR");
    } finally {
      setMobilePairBusy(false);
    }
  };

  if (!session) {
    return (
      <PairScreen
        brandLogo={BRAND_LOGO}
        pairInput={pairInput}
        setPairInput={setPairInput}
        localDaemonBase={localDaemonBase}
        setLocalDaemonBase={setLocalDaemonBase}
        clientName={clientName}
        setClientName={setClientName}
        isPairing={isPairing}
        desktopDaemonBase={desktopDaemonBase}
        mobileHostInput={mobileHostInput}
        setMobileHostInput={setMobileHostInput}
        mobilePairBusy={mobilePairBusy}
        mobilePairQr={mobilePairQr}
        mobilePairUrl={mobilePairUrl}
        pair={pair}
        pairLocal={pairLocal}
        createMobilePairingQr={createMobilePairingQr}
        connectionError={connectionError}
      />
    );
  }

  if (selectedAgent && selectedAgentId) {
    return (
      <AgentDetailScreen
        connectionState={connectionState}
        selectedAgent={selectedAgent}
        selectedAgentId={selectedAgentId}
        selectedEvents={selectedEvents}
        detailPrompt={detailPrompt}
        setDetailPrompt={setDetailPrompt}
        busy={busy}
        sendToAgent={sendToAgent}
        stopAgent={stopAgent}
        archiveAgent={archiveAgent}
        loadAgentEvents={loadAgentEvents}
        back={() => setSelectedAgentId(null)}
        connectionError={connectionError}
        statusColors={STATUS_COLORS}
      />
    );
  }

  return (
    <AgentsHomeScreen
      brandLogo={BRAND_LOGO}
      session={session}
      connectionState={connectionState}
      providerInput={providerInput}
      setProviderInput={setProviderInput}
      agentModeInput={agentModeInput}
      setAgentModeInput={setAgentModeInput}
      agentPermissionModeInput={agentPermissionModeInput}
      setAgentPermissionModeInput={setAgentPermissionModeInput}
      cwdInput={cwdInput}
      setCwdInput={setCwdInput}
      promptInput={promptInput}
      setPromptInput={setPromptInput}
      projects={sortedProjects}
      workspaces={sortedWorkspaces}
      selectedWorkspaceId={selectedWorkspaceId}
      selectWorkspace={(workspaceId) => {
        setSelectedWorkspaceId(workspaceId);
        const workspace = workspaces[workspaceId];
        if (workspace) setCwdInput(workspace.rootPath);
      }}
      newProjectName={newProjectName}
      setNewProjectName={setNewProjectName}
      newProjectRootPath={newProjectRootPath}
      setNewProjectRootPath={setNewProjectRootPath}
      createProject={createProject}
      newWorkspaceName={newWorkspaceName}
      setNewWorkspaceName={setNewWorkspaceName}
      newWorkspaceBranch={newWorkspaceBranch}
      setNewWorkspaceBranch={setNewWorkspaceBranch}
      createWorkspace={createWorkspace}
      terminals={sortedTerminals}
      selectedTerminalId={selectedTerminalId}
      selectTerminal={(terminalId) => {
        setSelectedTerminalId(terminalId);
        void loadTerminalOutput(terminalId);
      }}
      createTerminal={createTerminal}
      terminalInput={terminalInput}
      setTerminalInput={setTerminalInput}
      sendTerminalInput={sendTerminalInput}
      killTerminal={killTerminal}
      terminalOutputText={terminalOutputText}
      busy={busy}
      createAgent={createAgent}
      sortedAgents={visibleAgents}
      openAgent={(agentId) => {
        setSelectedAgentId(agentId);
        void loadAgentEvents(agentId);
      }}
      disconnect={disconnect}
      desktopDaemonBase={desktopDaemonBase}
      mobileHostInput={mobileHostInput}
      setMobileHostInput={setMobileHostInput}
      mobilePairBusy={mobilePairBusy}
      mobilePairQr={mobilePairQr}
      mobilePairUrl={mobilePairUrl}
      createMobilePairingQr={createMobilePairingQr}
      connectionError={connectionError}
      statusColors={STATUS_COLORS}
      selectedWorkspace={selectedWorkspace}
      projectNameById={projectNameById}
      pendingPermissions={pendingPermissions}
      approvePermission={approvePermission}
      denyPermission={denyPermission}
      schedules={sortedSchedules}
      scheduleIntervalInput={scheduleIntervalInput}
      setScheduleIntervalInput={setScheduleIntervalInput}
      schedulePromptInput={schedulePromptInput}
      setSchedulePromptInput={setSchedulePromptInput}
      createSchedule={createSchedule}
      scheduleAction={scheduleAction}
      mcpServers={sortedMcpServers}
      newMcpName={newMcpName}
      setNewMcpName={setNewMcpName}
      newMcpCommand={newMcpCommand}
      setNewMcpCommand={setNewMcpCommand}
      newMcpArgs={newMcpArgs}
      setNewMcpArgs={setNewMcpArgs}
      createMcpServer={createMcpServer}
      mcpAction={mcpAction}
      relaySessions={sortedRelaySessions}
      createRelaySession={createRelaySession}
      closeRelaySession={closeRelaySession}
      voiceSessions={sortedVoiceSessions}
      selectedVoiceSessionId={selectedVoiceSessionId}
      selectVoiceSession={(voiceSessionId) => {
        setSelectedVoiceSessionId(voiceSessionId);
        void loadVoiceEvents(voiceSessionId);
      }}
      createVoiceSession={createVoiceSession}
      endVoiceSession={endVoiceSession}
      voiceTextInput={voiceTextInput}
      setVoiceTextInput={setVoiceTextInput}
      sendVoiceText={sendVoiceText}
      selectedVoiceEvents={selectedVoiceEvents}
      selectedVoiceSession={selectedVoiceSession}
    />
  );
}


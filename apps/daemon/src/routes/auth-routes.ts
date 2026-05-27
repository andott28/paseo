import { parseEnvelope, type WsEnvelope } from "@gaa/protocol";
import { createGitWorktree, ensureProjectRootExists } from "../workspace-fs.js";
import { json, parseJson, parseLimit } from "../http/utils.js";
import type { RouteContext, RouteHandler } from "./types.js";

export function createAuthedRoutes(ctx: RouteContext): RouteHandler {
  return async ({ req, res, url, method, path }) => {
    if (method === "GET" && path === "/agents") return json(res, 200, { agents: ctx.manager.listAgents() }), true;

    const subagentsMatch = path.match(/^\/agents\/([^/]+)\/subagents$/);
    if (method === "GET" && subagentsMatch) return json(res, 200, { agents: ctx.manager.listSubagents(subagentsMatch[1]!) }), true;
    if (method === "POST" && subagentsMatch) {
      const parentAgentId = subagentsMatch[1]!;
      const body = (await parseJson(req)) as {
        provider?: string;
        cwd?: string;
        prompt?: string;
        title?: string;
        model?: string;
        mode?: "chat" | "plan" | "auto";
        permissionMode?: "allow" | "ask" | "deny";
      } | null;
      const parent = ctx.db.getAgent(parentAgentId);
      if (!parent) return json(res, 404, { code: "AGENT_NOT_FOUND", message: `No agent found for id ${parentAgentId}` }), true;
      const child = await ctx.manager.createAgent({
        parentAgentId,
        workspaceId: parent.workspaceId ?? undefined,
        provider: body?.provider?.trim() || parent.provider,
        cwd: body?.cwd?.trim() || parent.cwd,
        prompt: body?.prompt,
        title: body?.title,
        model: body?.model,
        mode: body?.mode ?? parent.mode,
        permissionMode: body?.permissionMode ?? parent.permissionMode,
      });
      return json(res, 200, { agent: child }), true;
    }

    const agentModeMatch = path.match(/^\/agents\/([^/]+)\/mode$/);
    if (method === "POST" && agentModeMatch) {
      const body = (await parseJson(req)) as { mode?: "chat" | "plan" | "auto"; permissionMode?: "allow" | "ask" | "deny" } | null;
      return json(res, 200, { agent: ctx.manager.setAgentModes(agentModeMatch[1]!, { mode: body?.mode, permissionMode: body?.permissionMode }) }), true;
    }

    if (method === "GET" && path === "/projects") return json(res, 200, { projects: ctx.db.listProjects() }), true;
    if (method === "POST" && path === "/projects") {
      const body = (await parseJson(req)) as { name?: string; rootPath?: string } | null;
      const name = body?.name?.trim();
      const rootPath = body?.rootPath?.trim();
      if (!name || !rootPath) return json(res, 400, { code: "INVALID_REQUEST", message: "name and rootPath are required" }), true;
      await ensureProjectRootExists(rootPath);
      const existing = ctx.db.findProjectByRootPath(rootPath);
      if (existing) return json(res, 409, { code: "PROJECT_EXISTS", message: `Project already exists for ${rootPath}` }), true;
      const project = ctx.db.createProject({ name, rootPath });
      const workspace = ctx.db.createWorkspace({ projectId: project.id, name: "main", rootPath, kind: "main", branch: null });
      ctx.hub.broadcastProjectUpdate(project);
      ctx.hub.broadcastWorkspaceUpdate(workspace);
      return json(res, 200, { project, workspace }), true;
    }

    if (method === "GET" && path === "/workspaces") return json(res, 200, { workspaces: ctx.db.listWorkspaces() }), true;
    if (method === "POST" && path === "/workspaces") {
      const body = (await parseJson(req)) as { projectId?: string; name?: string; kind?: "main" | "worktree"; branch?: string } | null;
      const projectId = body?.projectId?.trim();
      const name = body?.name?.trim();
      const kind = body?.kind ?? "worktree";
      if (!projectId || !name) return json(res, 400, { code: "INVALID_REQUEST", message: "projectId and name are required" }), true;
      const project = ctx.db.getProject(projectId);
      if (!project) return json(res, 404, { code: "PROJECT_NOT_FOUND", message: `Project not found: ${projectId}` }), true;
      if (kind === "main") {
        const existingMain = ctx.db.listWorkspaces().find((workspace) => workspace.projectId === project.id && workspace.kind === "main");
        if (existingMain) return json(res, 409, { code: "MAIN_WORKSPACE_EXISTS", message: "Main workspace already exists for project" }), true;
        const workspace = ctx.db.createWorkspace({ projectId: project.id, name, rootPath: project.rootPath, kind: "main", branch: null });
        ctx.hub.broadcastWorkspaceUpdate(workspace);
        return json(res, 200, { workspace }), true;
      }
      const created = await createGitWorktree({ projectRoot: project.rootPath, workspaceName: name, branch: body?.branch });
      const workspace = ctx.db.createWorkspace({ projectId: project.id, name, rootPath: created.rootPath, kind: "worktree", branch: created.branch });
      ctx.hub.broadcastWorkspaceUpdate(workspace);
      return json(res, 200, { workspace }), true;
    }
    const workspaceMatch = path.match(/^\/workspaces\/([^/]+)$/);
    if (method === "GET" && workspaceMatch) {
      const workspaceId = workspaceMatch[1]!;
      const workspace = ctx.db.getWorkspace(workspaceId);
      if (!workspace) return json(res, 404, { code: "WORKSPACE_NOT_FOUND", message: `Workspace not found: ${workspaceId}` }), true;
      return json(res, 200, { workspace, agents: ctx.db.listAgentsForWorkspace(workspaceId) }), true;
    }

    if (method === "GET" && path === "/terminals") return json(res, 200, { terminals: ctx.terminalManager.listTerminals() }), true;
    if (method === "POST" && path === "/terminals") {
      const body = (await parseJson(req)) as { workspaceId?: string; cwd?: string; command?: string } | null;
      const workspace = body?.workspaceId ? ctx.db.getWorkspace(body.workspaceId) : null;
      const cwd = body?.cwd?.trim() || workspace?.rootPath || process.cwd();
      return json(res, 200, { terminal: ctx.terminalManager.createTerminal({ workspaceId: workspace?.id ?? null, cwd, command: body?.command }) }), true;
    }
    const terminalOutputMatch = path.match(/^\/terminals\/([^/]+)\/output$/);
    if (method === "GET" && terminalOutputMatch) return json(res, 200, { terminalId: terminalOutputMatch[1], events: ctx.terminalManager.listOutput(terminalOutputMatch[1]!, parseLimit(url.searchParams.get("limit"), 1000, 5000)) }), true;
    const terminalInputMatch = path.match(/^\/terminals\/([^/]+)\/input$/);
    if (method === "POST" && terminalInputMatch) {
      const body = (await parseJson(req)) as { input?: string } | null;
      ctx.terminalManager.sendInput({ terminalId: terminalInputMatch[1]!, data: body?.input ?? "" });
      return json(res, 200, { ok: true }), true;
    }
    const terminalKillMatch = path.match(/^\/terminals\/([^/]+)\/kill$/);
    if (method === "POST" && terminalKillMatch) return json(res, 200, { terminal: ctx.terminalManager.killTerminal(terminalKillMatch[1]!) }), true;

    const eventsMatch = path.match(/^\/agents\/([^/]+)\/events$/);
    if (method === "GET" && eventsMatch) {
      const agentId = eventsMatch[1]!;
      const agent = ctx.db.getAgent(agentId);
      if (!agent) return json(res, 404, { code: "AGENT_NOT_FOUND", message: `No agent found for id ${agentId}` }), true;
      return json(res, 200, { agent, events: ctx.manager.listAgentEvents(agentId, parseLimit(url.searchParams.get("limit"), 300, 2000)) }), true;
    }

    if (method === "GET" && path === "/permissions") {
      const statusRaw = url.searchParams.get("status");
      const status = statusRaw === "pending" || statusRaw === "approved" || statusRaw === "denied" || statusRaw === "expired" ? statusRaw : undefined;
      return json(res, 200, { permissions: ctx.db.listPermissionRequests(status) }), true;
    }
    if (method === "POST" && path === "/permissions") {
      const body = (await parseJson(req)) as { agentId?: string; workspaceId?: string; action?: string; reason?: string; payloadJson?: string; expiresInSeconds?: number } | null;
      const action = body?.action?.trim();
      const reason = body?.reason?.trim();
      if (!action || !reason) return json(res, 400, { code: "INVALID_REQUEST", message: "action and reason are required" }), true;
      const permission = ctx.createPermissionRequest({
        agentId: body?.agentId,
        workspaceId: body?.workspaceId,
        action,
        reason,
        payloadJson: body?.payloadJson,
        expiresInSeconds: body?.expiresInSeconds,
      });
      ctx.hub.broadcastPermissionUpdate(permission);
      return json(res, 200, { permission }), true;
    }
    const permissionApproveMatch = path.match(/^\/permissions\/([^/]+)\/approve$/);
    if (method === "POST" && permissionApproveMatch) {
      const body = (await parseJson(req)) as { note?: string } | null;
      return json(res, 200, { permission: await ctx.decidePermission(permissionApproveMatch[1]!, "approved", body?.note) }), true;
    }
    const permissionDenyMatch = path.match(/^\/permissions\/([^/]+)\/deny$/);
    if (method === "POST" && permissionDenyMatch) {
      const body = (await parseJson(req)) as { note?: string } | null;
      return json(res, 200, { permission: await ctx.decidePermission(permissionDenyMatch[1]!, "denied", body?.note) }), true;
    }

    if (method === "GET" && path === "/schedules") return json(res, 200, { schedules: ctx.db.listSchedules() }), true;
    if (method === "POST" && path === "/schedules") {
      const body = (await parseJson(req)) as { workspaceId?: string; agentId?: string; provider?: string; cwd?: string; prompt?: string; intervalSeconds?: number } | null;
      if (!body?.provider || !body?.cwd || !body?.prompt || !body?.intervalSeconds) return json(res, 400, { code: "INVALID_REQUEST", message: "provider, cwd, prompt, intervalSeconds required" }), true;
      const schedule = ctx.db.createSchedule({ workspaceId: body.workspaceId ?? null, agentId: body.agentId ?? null, provider: body.provider, cwd: body.cwd, prompt: body.prompt, intervalSeconds: body.intervalSeconds });
      ctx.hub.broadcastScheduleUpdate(schedule);
      return json(res, 200, { schedule }), true;
    }
    const schedulePauseMatch = path.match(/^\/schedules\/([^/]+)\/pause$/);
    if (method === "POST" && schedulePauseMatch) return json(res, 200, { schedule: ctx.db.setScheduleStatus(schedulePauseMatch[1]!, "paused", null) }), true;
    const scheduleResumeMatch = path.match(/^\/schedules\/([^/]+)\/resume$/);
    if (method === "POST" && scheduleResumeMatch) return json(res, 200, { schedule: ctx.db.setScheduleStatus(scheduleResumeMatch[1]!, "active", null) }), true;
    const scheduleRunMatch = path.match(/^\/schedules\/([^/]+)\/run$/);
    if (method === "POST" && scheduleRunMatch) return json(res, 200, { schedule: await ctx.scheduleService.runNow(scheduleRunMatch[1]!) }), true;
    const scheduleDeleteMatch = path.match(/^\/schedules\/([^/]+)$/);
    if (method === "DELETE" && scheduleDeleteMatch) return ctx.db.deleteSchedule(scheduleDeleteMatch[1]!), json(res, 200, { ok: true }), true;

    if (method === "GET" && path === "/mcp/servers") return json(res, 200, { servers: ctx.mcpManager.listServers() }), true;
    if (method === "POST" && path === "/mcp/servers") {
      const body = (await parseJson(req)) as { name?: string; command?: string; args?: string[]; cwd?: string; env?: Record<string, string> } | null;
      if (!body?.name || !body?.command) return json(res, 400, { code: "INVALID_REQUEST", message: "name and command are required" }), true;
      const server = ctx.mcpManager.registerServer({ name: body.name, command: body.command, args: body.args, cwd: body.cwd, env: body.env });
      ctx.hub.broadcastMcpServerUpdate(server);
      return json(res, 200, { server }), true;
    }
    const mcpStartMatch = path.match(/^\/mcp\/servers\/([^/]+)\/start$/);
    if (method === "POST" && mcpStartMatch) return json(res, 200, { server: await ctx.mcpManager.startServer(mcpStartMatch[1]!) }), true;
    const mcpStopMatch = path.match(/^\/mcp\/servers\/([^/]+)\/stop$/);
    if (method === "POST" && mcpStopMatch) return json(res, 200, { server: ctx.mcpManager.stopServer(mcpStopMatch[1]!) }), true;
    const mcpDeleteMatch = path.match(/^\/mcp\/servers\/([^/]+)$/);
    if (method === "DELETE" && mcpDeleteMatch) return ctx.mcpManager.removeServer(mcpDeleteMatch[1]!), json(res, 200, { ok: true }), true;

    if (method === "GET" && path === "/relay/sessions") return json(res, 200, { relaySessions: ctx.relayManager.listSessions() }), true;
    if (method === "POST" && path === "/relay/sessions") {
      const body = (await parseJson(req)) as { clientName?: string } | null;
      const relaySession = ctx.relayManager.createSession(body?.clientName?.trim() || "relay-client");
      ctx.hub.broadcastRelaySessionUpdate(relaySession);
      return json(res, 200, { relaySession }), true;
    }
    const relayPollMatch = path.match(/^\/relay\/sessions\/([^/]+)\/poll$/);
    if (method === "GET" && relayPollMatch) {
      const relaySessionId = relayPollMatch[1]!;
      const messages = await ctx.relayManager.poll(relaySessionId, parseLimit(url.searchParams.get("limit"), 200, 2000), parseLimit(url.searchParams.get("timeoutMs"), 10000, 30000));
      const relaySession = ctx.relayManager.touchSession(relaySessionId);
      ctx.hub.broadcastRelaySessionUpdate(relaySession);
      return json(res, 200, { messages }), true;
    }
    const relaySendMatch = path.match(/^\/relay\/sessions\/([^/]+)\/send$/);
    if (method === "POST" && relaySendMatch) {
      const relaySessionId = relaySendMatch[1]!;
      const body = (await parseJson(req)) as { envelope?: WsEnvelope } | null;
      if (!body?.envelope) return json(res, 400, { code: "INVALID_REQUEST", message: "envelope is required" }), true;
      await ctx.hub.handleRelayEnvelope(parseEnvelope(body.envelope));
      const relaySession = ctx.relayManager.touchSession(relaySessionId);
      ctx.hub.broadcastRelaySessionUpdate(relaySession);
      return json(res, 200, { ok: true }), true;
    }
    const relayDeleteMatch = path.match(/^\/relay\/sessions\/([^/]+)$/);
    if (method === "DELETE" && relayDeleteMatch) {
      const relaySession = ctx.relayManager.closeSession(relayDeleteMatch[1]!);
      ctx.hub.broadcastRelaySessionUpdate(relaySession);
      return json(res, 200, { relaySession }), true;
    }

    if (method === "GET" && path === "/voice/sessions") return json(res, 200, { voiceSessions: ctx.voiceManager.listVoiceSessions() }), true;
    if (method === "POST" && path === "/voice/sessions") {
      const body = (await parseJson(req)) as { workspaceId?: string; agentId?: string } | null;
      const voiceSession = ctx.voiceManager.createVoiceSession({ workspaceId: body?.workspaceId, agentId: body?.agentId });
      ctx.hub.broadcastVoiceSessionUpdate(voiceSession);
      return json(res, 200, { voiceSession }), true;
    }
    const voiceEventsMatch = path.match(/^\/voice\/sessions\/([^/]+)\/events$/);
    if (method === "GET" && voiceEventsMatch) return json(res, 200, { events: ctx.voiceManager.listVoiceEvents(voiceEventsMatch[1]!, parseLimit(url.searchParams.get("limit"), 500, 3000)) }), true;
    const voiceChunkMatch = path.match(/^\/voice\/sessions\/([^/]+)\/chunk$/);
    if (method === "POST" && voiceChunkMatch) {
      const body = (await parseJson(req)) as { text?: string; sendToAgent?: boolean } | null;
      const text = body?.text?.trim();
      if (!text) return json(res, 400, { code: "INVALID_REQUEST", message: "text is required" }), true;
      const event = await ctx.voiceManager.ingestText({ voiceSessionId: voiceChunkMatch[1]!, text, sendToAgent: body?.sendToAgent });
      ctx.hub.broadcastVoiceChunk(event);
      return json(res, 200, { event }), true;
    }
    const voiceEndMatch = path.match(/^\/voice\/sessions\/([^/]+)\/end$/);
    if (method === "POST" && voiceEndMatch) {
      const voiceSession = ctx.voiceManager.endVoiceSession(voiceEndMatch[1]!);
      ctx.hub.broadcastVoiceSessionUpdate(voiceSession);
      return json(res, 200, { voiceSession }), true;
    }
    return false;
  };
}

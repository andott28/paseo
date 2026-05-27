import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { AgentsRepo, PermissionsRepo, RuntimeRepo, SchedulesRepo, WorkspacesRepo, createDbCore } from "./db/index.js";

function withRepos(
  testBody: (deps: {
    agents: AgentsRepo;
    workspaces: WorkspacesRepo;
    permissions: PermissionsRepo;
    schedules: SchedulesRepo;
    runtime: RuntimeRepo;
  }) => void,
): void {
  const dir = mkdtempSync(join(tmpdir(), "gaa-daemon-repos-"));
  const path = join(dir, "daemon.db");
  const core = createDbCore(path);
  try {
    testBody({
      agents: new AgentsRepo(core),
      workspaces: new WorkspacesRepo(core),
      permissions: new PermissionsRepo(core),
      schedules: new SchedulesRepo(core),
      runtime: new RuntimeRepo(core),
    });
  } finally {
    core.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("db repositories", () => {
  it("persists project/workspace/agent through repos", () => {
    withRepos(({ workspaces, agents }) => {
      const project = workspaces.createProject({ name: "repo-test", rootPath: process.cwd() });
      const workspace = workspaces.createWorkspace({
        projectId: project.id,
        name: "main",
        rootPath: process.cwd(),
        kind: "main",
      });
      const agent = agents.create({
        workspaceId: workspace.id,
        provider: "codex",
        cwd: workspace.rootPath,
        sessionId: "s-1",
      });
      expect(workspaces.listProjects()).toHaveLength(1);
      expect(workspaces.listWorkspaces()).toHaveLength(1);
      expect(agents.listForWorkspace(workspace.id)[0]?.id).toBe(agent.id);
    });
  });

  it("persists permission + schedule + runtime records through repos", () => {
    withRepos(({ permissions, schedules, runtime }) => {
      const permission = permissions.create({ action: "agent_send", reason: "repo-check", payloadJson: "{}" });
      expect(permission.status).toBe("pending");
      const decided = permissions.decide(permission.id, "approved");
      expect(decided.status).toBe("approved");

      const schedule = schedules.create({
        provider: "codex",
        cwd: process.cwd(),
        prompt: "ping",
        intervalSeconds: 60,
        nextRunAt: new Date(Date.now() - 1000).toISOString(),
      });
      expect(schedules.listDue(new Date().toISOString(), 10).map((item) => item.id)).toContain(schedule.id);

      const mcp = runtime.createMcpServer({ name: "repo-mcp", command: "node", args: ["-v"] });
      const relay = runtime.createRelaySession("repo-client");
      const voice = runtime.createVoiceSession({});
      runtime.appendVoiceEvent({ voiceSessionId: voice.id, role: "user", text: "hello" });

      expect(runtime.listMcpServers().map((server) => server.id)).toContain(mcp.id);
      expect(runtime.listRelaySessions().map((session) => session.id)).toContain(relay.id);
      expect(runtime.listVoiceSessions().map((session) => session.id)).toContain(voice.id);
      expect(runtime.listVoiceEvents(voice.id, 10)).toHaveLength(1);
    });
  });
});

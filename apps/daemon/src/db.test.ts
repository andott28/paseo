import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { DatabaseService } from "./db.js";

function withDb(testBody: (db: DatabaseService) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "gaa-daemon-db-"));
  const path = join(dir, "daemon.db");
  const db = new DatabaseService(path);
  try {
    testBody(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("DatabaseService pairing tokens", () => {
  it("redeems token once and rejects second redeem", () => {
    withDb((db) => {
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      db.createPairingToken("token-1", expiresAt);
      expect(db.redeemPairingToken("token-1")).toBe(true);
      expect(db.redeemPairingToken("token-1")).toBe(false);
    });
  });

  it("rejects expired pairing token", () => {
    withDb((db) => {
      const expiresAt = new Date(Date.now() - 1000).toISOString();
      db.createPairingToken("token-2", expiresAt);
      expect(db.redeemPairingToken("token-2")).toBe(false);
    });
  });
});

describe("DatabaseService events", () => {
  it("appends events in sequence order and loads them in order", () => {
    withDb((db) => {
      const agent = db.createAgent({
        provider: "codex",
        cwd: process.cwd(),
        sessionId: "session-1",
      });
      db.setAgentStatus(agent.id, "idle");
      db.appendEvent({
        agentId: agent.id,
        eventType: "assistant_text",
        text: "first",
      });
      db.appendEvent({
        agentId: agent.id,
        eventType: "assistant_text",
        text: "second",
      });

      const events = db.listEvents(agent.id, 100);
      expect(events.map((e) => e.seq)).toEqual([1, 2]);
      expect(events.map((e) => e.text)).toEqual(["first", "second"]);
    });
  });
});

describe("DatabaseService projects and workspaces", () => {
  it("creates project and workspace and associates agent", () => {
    withDb((db) => {
      const project = db.createProject({
        name: "GAA",
        rootPath: process.cwd(),
      });
      const workspace = db.createWorkspace({
        projectId: project.id,
        name: "main",
        rootPath: process.cwd(),
        kind: "main",
      });
      const agent = db.createAgent({
        workspaceId: workspace.id,
        provider: "codex",
        cwd: process.cwd(),
        sessionId: "session-2",
      });
      const projects = db.listProjects();
      const workspaces = db.listWorkspaces();
      const workspaceAgents = db.listAgentsForWorkspace(workspace.id);
      expect(projects).toHaveLength(1);
      expect(workspaces).toHaveLength(1);
      expect(workspaceAgents).toHaveLength(1);
      expect(workspaceAgents[0]?.id).toBe(agent.id);
      expect(workspaceAgents[0]?.workspaceId).toBe(workspace.id);
      expect(workspaceAgents[0]?.mode).toBe("chat");
      expect(workspaceAgents[0]?.permissionMode).toBe("allow");
    });
  });
});

describe("DatabaseService permissions and schedules", () => {
  it("creates and decides permission requests", () => {
    withDb((db) => {
      const permission = db.createPermissionRequest({
        action: "agent_send",
        reason: "Need approval",
        payloadJson: "{}",
      });
      expect(permission.status).toBe("pending");
      const decided = db.updatePermissionDecision(permission.id, "approved", "ok");
      expect(decided.status).toBe("approved");
      expect(decided.decision).toBe("approved");
    });
  });

  it("creates schedules and resolves due listing", () => {
    withDb((db) => {
      const schedule = db.createSchedule({
        provider: "codex",
        cwd: process.cwd(),
        prompt: "ping",
        intervalSeconds: 60,
        nextRunAt: new Date(Date.now() - 1000).toISOString(),
      });
      const due = db.listDueSchedules(new Date().toISOString(), 10);
      expect(due.map((item) => item.id)).toContain(schedule.id);
      const marked = db.markScheduleRun(schedule.id, { success: true });
      expect(marked.lastRunAt).not.toBeNull();
    });
  });
});

describe("DatabaseService voice sessions", () => {
  it("stores ordered voice events", () => {
    withDb((db) => {
      const session = db.createVoiceSession({});
      db.appendVoiceEvent({ voiceSessionId: session.id, role: "user", text: "hello" });
      db.appendVoiceEvent({ voiceSessionId: session.id, role: "system", text: "ack" });
      const events = db.listVoiceEvents(session.id, 100);
      expect(events.map((event) => event.seq)).toEqual([1, 2]);
      expect(events.map((event) => event.text)).toEqual(["hello", "ack"]);
    });
  });
});

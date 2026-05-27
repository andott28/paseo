import type { ProjectRecord, WorkspaceRecord } from "@gaa/protocol";
import { apiJson, authHeaders } from "../client/daemon-cli-client.js";
import { loadSession } from "../session/session-store.js";
import type { CommandRegistry } from "./types.js";

async function listProjects(): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/projects", { headers: authHeaders(session) });
  const projects = body.projects as ProjectRecord[];
  for (const project of projects) process.stdout.write(`${project.id}\t${project.name}\t${project.rootPath}\n`);
}

async function addProject(name: string, rootPath: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/projects", {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ name, rootPath }),
  });
  const project = body.project as ProjectRecord;
  const workspace = body.workspace as WorkspaceRecord;
  process.stdout.write(`project ${project.id} created with main workspace ${workspace.id}\n`);
}

async function listWorkspaces(): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/workspaces", { headers: authHeaders(session) });
  const workspaces = body.workspaces as WorkspaceRecord[];
  for (const workspace of workspaces) process.stdout.write(`${workspace.id}\t${workspace.projectId}\t${workspace.kind}\t${workspace.name}\t${workspace.rootPath}\n`);
}

async function createWorkspace(projectId: string, name: string, branch?: string): Promise<void> {
  const session = await loadSession();
  const body = await apiJson(session.httpBaseUrl + "/workspaces", {
    method: "POST",
    headers: { ...authHeaders(session), "content-type": "application/json" },
    body: JSON.stringify({ projectId, name, kind: "worktree", branch }),
  });
  const workspace = body.workspace as WorkspaceRecord;
  process.stdout.write(`workspace ${workspace.id} created at ${workspace.rootPath}\n`);
}

export const workspaceCommands: CommandRegistry = {
  projects: async () => listProjects(),
  "project-add": async (args) => addProject(args[0] ?? "", args[1] ?? ""),
  workspaces: async () => listWorkspaces(),
  "workspace-create": async (args) => createWorkspace(args[0] ?? "", args[1] ?? "", args[2]),
};

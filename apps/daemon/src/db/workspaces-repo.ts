import type { ProjectRecord, WorkspaceKind, WorkspaceRecord } from "@gaa/protocol";
import type { DbCore } from "./core.js";

export class WorkspacesRepo {
  constructor(private readonly core: DbCore) {}

  createProject(input: { name: string; rootPath: string }): ProjectRecord {
    return this.core.service.createProject(input);
  }

  listProjects(): ProjectRecord[] {
    return this.core.service.listProjects();
  }

  getProject(projectId: string): ProjectRecord | null {
    return this.core.service.getProject(projectId);
  }

  findProjectByRootPath(rootPath: string): ProjectRecord | null {
    return this.core.service.findProjectByRootPath(rootPath);
  }

  createWorkspace(input: { projectId: string; name: string; rootPath: string; kind: WorkspaceKind; branch?: string | null }): WorkspaceRecord {
    return this.core.service.createWorkspace(input);
  }

  listWorkspaces(): WorkspaceRecord[] {
    return this.core.service.listWorkspaces();
  }

  getWorkspace(workspaceId: string): WorkspaceRecord | null {
    return this.core.service.getWorkspace(workspaceId);
  }
}

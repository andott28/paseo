import type { PermissionRequestRecord, PermissionStatus } from "@gaa/protocol";
import type { DbCore } from "./core.js";

export class PermissionsRepo {
  constructor(private readonly core: DbCore) {}

  create(input: {
    agentId?: string;
    workspaceId?: string;
    action: string;
    reason: string;
    payloadJson?: string;
    expiresAt?: string | null;
  }): PermissionRequestRecord {
    return this.core.service.createPermissionRequest(input);
  }

  list(status?: PermissionStatus): PermissionRequestRecord[] {
    return this.core.service.listPermissionRequests(status);
  }

  decide(permissionId: string, decision: "approved" | "denied", note?: string): PermissionRequestRecord {
    return this.core.service.updatePermissionDecision(permissionId, decision, note);
  }

  expirePending(nowIso?: string): PermissionRequestRecord[] {
    return this.core.service.expirePendingPermissions(nowIso);
  }
}

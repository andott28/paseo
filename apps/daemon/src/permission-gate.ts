export class PermissionGate {
  private readonly waiters = new Map<
    string,
    {
      resolve: (decision: "approved" | "denied" | "expired") => void;
      timeout: ReturnType<typeof setTimeout>;
    }
  >();

  async waitForDecision(permissionId: string, timeoutMs: number): Promise<"approved" | "denied" | "expired"> {
    if (timeoutMs <= 0) return "expired";
    return await new Promise<"approved" | "denied" | "expired">((resolve) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(permissionId);
        resolve("expired");
      }, timeoutMs);
      this.waiters.set(permissionId, { resolve, timeout });
    });
  }

  resolve(permissionId: string, decision: "approved" | "denied" | "expired"): void {
    const waiter = this.waiters.get(permissionId);
    if (!waiter) return;
    clearTimeout(waiter.timeout);
    this.waiters.delete(permissionId);
    waiter.resolve(decision);
  }
}

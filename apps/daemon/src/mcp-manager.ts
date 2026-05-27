import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { McpServerRecord } from "@gaa/protocol";
import type { DatabaseService } from "./db.js";

interface ActiveMcpProcess {
  child: ChildProcessWithoutNullStreams;
  serverId: string;
}

interface McpManagerHooks {
  onServerUpdate(server: McpServerRecord): void;
}

export class McpManager {
  private readonly db: DatabaseService;
  private readonly hooks: McpManagerHooks;
  private readonly active = new Map<string, ActiveMcpProcess>();

  constructor(input: { db: DatabaseService; hooks: McpManagerHooks }) {
    this.db = input.db;
    this.hooks = input.hooks;
  }

  listServers(): McpServerRecord[] {
    return this.db.listMcpServers();
  }

  registerServer(input: {
    name: string;
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
  }): McpServerRecord {
    const server = this.db.createMcpServer(input);
    this.hooks.onServerUpdate(server);
    return server;
  }

  async startServer(serverId: string): Promise<McpServerRecord> {
    if (this.active.has(serverId)) {
      return this.db.getMcpServerOrThrow(serverId);
    }
    const server = this.db.getMcpServerOrThrow(serverId);
    const args = JSON.parse(server.argsJson) as string[];
    const env = JSON.parse(server.envJson) as Record<string, string>;
    const starting = this.db.setMcpServerRuntime(serverId, { status: "starting", lastError: null });
    this.hooks.onServerUpdate(starting);

    const child = spawn(server.command, args, {
      cwd: server.cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.active.set(serverId, { child, serverId });
    const running = this.db.setMcpServerRuntime(serverId, {
      status: "running",
      pid: child.pid ?? null,
      lastError: null,
      heartbeat: true,
    });
    this.hooks.onServerUpdate(running);

    child.stdout.on("data", () => {
      const updated = this.db.setMcpServerRuntime(serverId, {
        status: "running",
        pid: child.pid ?? null,
        heartbeat: true,
      });
      this.hooks.onServerUpdate(updated);
    });

    child.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      const updated = this.db.setMcpServerRuntime(serverId, {
        status: "running",
        pid: child.pid ?? null,
        lastError: message.length ? message : null,
        heartbeat: true,
      });
      this.hooks.onServerUpdate(updated);
    });

    child.on("close", (code, signal) => {
      this.active.delete(serverId);
      const detail = `exit code=${code ?? "null"} signal=${signal ?? "null"}`;
      const updated = this.db.setMcpServerRuntime(serverId, {
        status: "stopped",
        pid: null,
        lastError: detail,
      });
      this.hooks.onServerUpdate(updated);
    });

    child.on("error", (error) => {
      this.active.delete(serverId);
      const updated = this.db.setMcpServerRuntime(serverId, {
        status: "error",
        pid: null,
        lastError: error.message,
      });
      this.hooks.onServerUpdate(updated);
    });

    return this.db.getMcpServerOrThrow(serverId);
  }

  stopServer(serverId: string): McpServerRecord {
    const active = this.active.get(serverId);
    if (active && !active.child.killed) {
      active.child.kill("SIGTERM");
    }
    this.active.delete(serverId);
    const updated = this.db.setMcpServerRuntime(serverId, {
      status: "stopped",
      pid: null,
    });
    this.hooks.onServerUpdate(updated);
    return updated;
  }

  removeServer(serverId: string): void {
    if (this.active.has(serverId)) {
      this.stopServer(serverId);
    }
    this.db.deleteMcpServer(serverId);
  }

  stopAll(): void {
    for (const serverId of this.active.keys()) {
      this.stopServer(serverId);
    }
  }
}

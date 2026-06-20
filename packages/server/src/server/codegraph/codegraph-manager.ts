import { existsSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { Logger } from "pino";

const execAsync = promisify(exec);

export interface CodeGraphProjectStatus {
  cwd: string;
  isGitRepo: boolean;
  hasCodeGraph: boolean;
  isBuilt: boolean;
  nodeCount?: number;
  edgeCount?: number;
  branch?: string;
}

export interface CodeGraphNode {
  id: string;
  name: string;
  kind: string;
  file: string;
  line: number;
  signature?: string;
}

export interface CodeGraphGraph {
  nodes: CodeGraphNode[];
  edges: { id: string; source: string; target: string; kind: string }[];
}

export class CodeGraphManager {
  private logger: Logger;
  private binaryPath: string | null = null;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: "codegraph" });
  }

  async initialize(): Promise<boolean> {
    try {
      const { stdout } = await execAsync("where codegraph.cmd 2>nul || where codegraph 2>nul");
      const path = stdout.trim().split("\n")[0]?.trim();
      if (path) {
        this.binaryPath = path;
        this.logger.info({ path }, "CodeGraph binary found");
        return true;
      }
    } catch {
      // not found
    }
    try {
      const { stdout } = await execAsync("npx --yes @optave/codegraph --version");
      if (stdout) {
        this.binaryPath = "npx --yes @optave/codegraph";
        this.logger.info("CodeGraph available via npx");
        return true;
      }
    } catch {
      // not found via npx either
    }
    this.logger.warn("CodeGraph binary (@optave/codegraph) not found. Install with: npm install -g @optave/codegraph");
    return false;
  }

  private async run(args: string, cwd?: string): Promise<string> {
    if (!this.binaryPath) {
      throw new Error("CodeGraph binary not available");
    }
    const cmd = `${this.binaryPath} ${args}`;
    try {
      const { stdout } = await execAsync(cmd, cwd ? { cwd, maxBuffer: 50 * 1024 * 1024 } : { maxBuffer: 50 * 1024 * 1024 });
      return stdout;
    } catch (err: any) {
      throw new Error(err.stderr || err.message || String(err));
    }
  }

  async build(cwd: string): Promise<boolean> {
    const dbPath = join(cwd, ".codegraph", "graph.db");
    if (existsSync(dbPath)) {
      this.logger.info({ cwd }, "Code graph already built, skipping");
      return true;
    }
    try {
      this.logger.info({ cwd }, "Building code graph");
      await this.run(`build "${cwd}" --no-cfg --no-dataflow --no-complexity`, cwd);
      this.logger.info({ cwd }, "Code graph built successfully");
      return true;
    } catch (err) {
      this.logger.error({ err, cwd }, "Failed to build code graph");
      return false;
    }
  }

  async getProjectStatus(cwd: string): Promise<CodeGraphProjectStatus> {
    const dbPath = join(cwd, ".codegraph", "graph.db");
    const hasCodeGraph = existsSync(dbPath);
    const isGitRepo = existsSync(join(cwd, ".git"));

    let nodeCount: number | undefined;
    let edgeCount: number | undefined;
    let branch: string | undefined;

    if (hasCodeGraph) {
      try {
        const stdout = await this.run(`stats -j -d "${dbPath}"`);
        const stats = JSON.parse(stdout);
        nodeCount = stats.nodes?.total ?? stats.nodeCount?.total ?? stats.nodeCount;
        edgeCount = stats.edges?.total ?? stats.edgeCount?.total ?? stats.edgeCount;
      } catch {
        // stats not available
      }
      try {
        const { stdout: branchStdout } = await execAsync("git rev-parse --abbrev-ref HEAD", { cwd });
        branch = branchStdout.trim();
      } catch {
        // not a git repo or no branch
      }
    }

    return {
      cwd,
      isGitRepo,
      hasCodeGraph,
      isBuilt: hasCodeGraph,
      nodeCount,
      edgeCount,
      branch,
    };
  }

  async getFullGraph(cwd: string): Promise<CodeGraphGraph | null> {
    const dbPath = join(cwd, ".codegraph", "graph.db");
    if (!existsSync(dbPath)) {
      return null;
    }
    try {
      const stdout = await this.run(`export --format json --functions -d "${dbPath}"`);
      const data = JSON.parse(stdout);
      const nodes: CodeGraphNode[] = (data.nodes ?? data.symbols ?? []).map((n: any, i: number) => ({
        id: n.id ?? `node-${i}`,
        name: n.name ?? n.label ?? "unknown",
        kind: n.kind ?? n.type ?? "symbol",
        file: n.file ?? n.location?.file ?? "",
        line: n.line ?? n.location?.line ?? 0,
        signature: n.signature ?? n.signature,
      }));
      const rawEdges = data.edges ?? data.links ?? [];
      const nodeFileMap = new Map<string, string>();
      for (const n of nodes) {
        nodeFileMap.set(n.id, n.file);
      }
      const edges: CodeGraphGraph["edges"] = rawEdges.map((e: any, i: number) => ({
        id: e.id ?? `edge-${i}`,
        source: e.source ?? e.from ?? "",
        target: e.target ?? e.to ?? "",
        kind: e.kind ?? e.type ?? "depends",
      }));
      // Add co-location edges: connect symbols that share a file
      const files = new Map<string, string[]>();
      for (const n of nodes) {
        if (!n.file) continue;
        if (!files.has(n.file)) files.set(n.file, []);
        files.get(n.file)!.push(n.id);
      }
      let edgeIndex = rawEdges.length;
      for (const [, ids] of files) {
        if (ids.length < 2) continue;
        for (let i = 0; i < ids.length - 1; i++) {
          edges.push({
            id: `coloc-${edgeIndex}`,
            source: ids[i],
            target: ids[i + 1],
            kind: "collocation",
          });
          edgeIndex++;
        }
      }
      return { nodes, edges };
    } catch (err) {
      this.logger.error({ err, cwd }, "Failed to export graph");
      return null;
    }
  }

  async querySymbol(cwd: string, symbol: string): Promise<CodeGraphNode | null> {
    const dbPath = join(cwd, ".codegraph", "graph.db");
    if (!existsSync(dbPath)) return null;
    try {
      const stdout = await this.run(`where -j -d "${dbPath}" "${symbol}"`);
      const data = JSON.parse(stdout);
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        return {
          id: first.id ?? "symbol-0",
          name: first.name ?? first.label ?? symbol,
          kind: first.kind ?? first.type ?? "symbol",
          file: first.file ?? first.location?.file ?? "",
          line: first.line ?? first.location?.line ?? 0,
          signature: first.signature,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async getSymbolContext(cwd: string, symbol: string): Promise<{
    symbol: CodeGraphNode;
    callers: { name: string; file: string; line: number }[];
    callees: { name: string; file: string; line: number }[];
  } | null> {
    const dbPath = join(cwd, ".codegraph", "graph.db");
    if (!existsSync(dbPath)) return null;
    try {
      const stdout = await this.run(`context -j -d "${dbPath}" "${symbol}"`);
      const data = JSON.parse(stdout);
      return {
        symbol: {
          id: data.id ?? data.symbol?.id ?? "symbol-0",
          name: data.name ?? data.symbol?.name ?? symbol,
          kind: data.kind ?? data.symbol?.kind ?? "symbol",
          file: data.file ?? data.symbol?.file ?? "",
          line: data.line ?? data.symbol?.line ?? 0,
        },
        callers: (data.callers ?? []).map((c: any) => ({
          name: c.name ?? c.function ?? c,
          file: c.file ?? "",
          line: c.line ?? 0,
        })),
        callees: (data.callees ?? data.dependencies ?? []).map((c: any) => ({
          name: c.name ?? c.function ?? c,
          file: c.file ?? "",
          line: c.line ?? 0,
        })),
      };
    } catch {
      return null;
    }
  }

  async getAllSymbols(cwd: string): Promise<CodeGraphNode[]> {
    const dbPath = join(cwd, ".codegraph", "graph.db");
    if (!existsSync(dbPath)) return [];
    try {
      const stdout = await this.run(`export --format json -d "${dbPath}"`);
      const data = JSON.parse(stdout);
      const nodes: CodeGraphNode[] = (data.nodes ?? data.symbols ?? []).map((n: any, i: number) => ({
        id: n.id ?? `node-${i}`,
        name: n.name ?? n.label ?? n.symbol ?? "unknown",
        kind: n.kind ?? n.type ?? "symbol",
        file: n.file ?? n.location?.file ?? "",
        line: n.line ?? n.location?.line ?? 0,
        signature: n.signature,
      }));
      return nodes;
    } catch {
      return [];
    }
  }

  async searchSymbols(cwd: string, pattern: string, topK?: number): Promise<CodeGraphNode[]> {
    const dbPath = join(cwd, ".codegraph", "graph.db");
    if (!existsSync(dbPath)) return [];
    try {
      const stdout = await this.run(`query -j -d "${dbPath}" "${pattern}"`);
      const data = JSON.parse(stdout);
      const raw = data.results ?? data.nodes ?? data.symbols ?? (Array.isArray(data) ? data : []);
      const limited = topK != null ? raw.slice(0, topK) : raw;
      return limited.map((n: any, i: number) => ({
        id: n.id ?? `result-${i}`,
        name: n.name ?? n.label ?? n.symbol ?? String(n),
        kind: n.kind ?? n.type ?? "symbol",
        file: n.file ?? n.location?.file ?? "",
        line: n.line ?? n.location?.line ?? 0,
      }));
    } catch {
      return [];
    }
  }

  async getSymbolCode(cwd: string, symbol: CodeGraphNode): Promise<string | null> {
    if (!symbol.file) return null;
    const filePath = join(cwd, symbol.file);
    if (!existsSync(filePath)) return null;
    try {
      const { readFile } = await import("fs/promises");
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const start = Math.max(0, symbol.line - 5);
      const end = Math.min(lines.length, symbol.line + 5);
      return lines.slice(start, end).join("\n");
    } catch {
      return null;
    }
  }

  isAvailable(): boolean {
    return this.binaryPath !== null;
  }

  getBinaryPath(): string | null {
    return this.binaryPath;
  }

  async shutdown(): Promise<void> {
    this.logger.info("CodeGraph manager shutting down");
  }
}

let globalManager: CodeGraphManager | null = null;

export function getCodeGraphManager(logger?: Logger): CodeGraphManager {
  if (!globalManager) {
    if (!logger) {
      throw new Error("CodeGraphManager not initialized");
    }
    globalManager = new CodeGraphManager(logger);
  }
  return globalManager;
}

export async function initializeCodeGraph(logger: Logger): Promise<CodeGraphManager> {
  const manager = getCodeGraphManager(logger);
  await manager.initialize();
  return manager;
}

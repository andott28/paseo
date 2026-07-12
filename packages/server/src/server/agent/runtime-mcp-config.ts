import path from "node:path";
import type { AgentSessionConfig, McpServerConfig } from "./agent-sdk-types.js";

const PASEO_MCP_SERVER_NAME = "paseo";
const PASEO_MCP_PATHNAME = "/mcp/agents";
const IN_MEMORIA_MCP_SERVER_NAME = "in-memoria";

export function stripInternalPaseoMcpServer(config: AgentSessionConfig): AgentSessionConfig {
  const mcpServers = config.mcpServers;
  if (!mcpServers) {
    return config;
  }

  const paseoServer = mcpServers[PASEO_MCP_SERVER_NAME];
  if (!paseoServer || !isInternalPaseoMcpServer(paseoServer)) {
    return config;
  }

  const nextMcpServers = { ...mcpServers };
  delete nextMcpServers[PASEO_MCP_SERVER_NAME];

  const next = { ...config };
  if (Object.keys(nextMcpServers).length > 0) {
    next.mcpServers = nextMcpServers;
  } else {
    delete next.mcpServers;
  }
  return next;
}

export function withRuntimePaseoMcpServer(params: {
  config: AgentSessionConfig;
  agentId: string;
  mcpBaseUrl: string | null;
  /**
   * Capability token authenticating the injected connection to the daemon's
   * Agent MCP endpoint. The daemon password is gated off this route, so without
   * this header the agent's MCP requests are rejected when a password is set.
   */
  mcpAuthToken: string | null;
}): AgentSessionConfig {
  const storedConfig = stripInternalPaseoMcpServer(params.config);
  if (!params.mcpBaseUrl || storedConfig.mcpServers?.[PASEO_MCP_SERVER_NAME]) {
    return storedConfig;
  }

  return {
    ...storedConfig,
    mcpServers: {
      [PASEO_MCP_SERVER_NAME]: {
        type: "http",
        url: `${params.mcpBaseUrl}?callerAgentId=${params.agentId}`,
        ...(params.mcpAuthToken
          ? { headers: { Authorization: `Bearer ${params.mcpAuthToken}` } }
          : {}),
      },
      ...storedConfig.mcpServers,
    },
  };
}

function isInternalPaseoMcpServer(config: McpServerConfig): boolean {
  if (config.type !== "http" && config.type !== "sse") {
    return false;
  }

  try {
    return new URL(config.url).pathname === PASEO_MCP_PATHNAME;
  } catch {
    return false;
  }
}

export function stripInternalInMemoriaMcpServer(config: AgentSessionConfig): AgentSessionConfig {
  const mcpServers = config.mcpServers;
  if (!mcpServers) {
    return config;
  }

  const inMemoriaServer = mcpServers[IN_MEMORIA_MCP_SERVER_NAME];
  if (!inMemoriaServer || !isInternalInMemoriaMcpServer(inMemoriaServer)) {
    return config;
  }

  const nextMcpServers = { ...mcpServers };
  delete nextMcpServers[IN_MEMORIA_MCP_SERVER_NAME];

  const next = { ...config };
  if (Object.keys(nextMcpServers).length > 0) {
    next.mcpServers = nextMcpServers;
  } else {
    delete next.mcpServers;
  }
  return next;
}

export function withRuntimeInMemoriaMcpServer(params: {
  config: AgentSessionConfig;
  cwd: string;
  basePath: string;
}): AgentSessionConfig {
  const storedConfig = params.config;
  if (
    !params.basePath ||
    !params.cwd ||
    storedConfig.mcpServers?.[IN_MEMORIA_MCP_SERVER_NAME]
  ) {
    return storedConfig;
  }

  const projectDir = sanitizeProjectPath(params.cwd);
  const storagePath = path.join(params.basePath, projectDir);

  return {
    ...storedConfig,
    mcpServers: {
      [IN_MEMORIA_MCP_SERVER_NAME]: {
        type: "stdio",
        command: "npx",
        args: ["in-memoria", "server"],
        env: {
          IN_MEMORIA_STORAGE_DIR: storagePath,
        },
      },
      ...storedConfig.mcpServers,
    },
  };
}

function sanitizeProjectPath(cwd: string): string {
  const { root } = path.win32.parse(cwd);
  const withoutRoot = cwd.slice(root.length).replace(/[\\/]+$/, "");
  const sanitizedRoot = root.replace(/[:\\/]+/g, "-").replace(/^-+|-+$/g, "");
  const prefix = sanitizedRoot ? sanitizedRoot + "-" : "";
  if (!withoutRoot) {
    return sanitizedRoot || "root";
  }
  return prefix + withoutRoot.replace(/[\\/]+/g, "-");
}

function isInternalInMemoriaMcpServer(config: McpServerConfig): boolean {
  if (config.type !== "stdio") {
    return false;
  }

  const args = config.args ?? [];
  const hasInMemoriaServer =
    args.includes("in-memoria") && args.includes("server");

  const envStorageDir = config.env?.["IN_MEMORIA_STORAGE_DIR"];
  const isDaemonManaged =
    typeof envStorageDir === "string" && envStorageDir.length > 0;

  return hasInMemoriaServer && isDaemonManaged;
}

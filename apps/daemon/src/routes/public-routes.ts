import { randomBytes } from "node:crypto";
import { buildWsEndpoint, createPairingOffer } from "../pairing.js";
import { json, parseJson } from "../http/utils.js";
import type { RouteContext, RouteHandler } from "./types.js";

export function createPublicRoutes(ctx: RouteContext): RouteHandler {
  return async ({ req, res, method, path }) => {
    if (method === "GET" && path === "/health") {
      json(res, 200, {
        ok: true,
        serverId: ctx.serverId,
        now: new Date().toISOString(),
        providers: await ctx.providers.getAvailabilitySnapshot(),
      });
      return true;
    }

    if (method === "POST" && path === "/pairing/offer") {
      const body = (await parseJson(req)) as { requestHost?: string } | null;
      const wsEndpoint = buildWsEndpoint({
        host: ctx.config.GAA_DAEMON_HOST,
        port: ctx.config.GAA_DAEMON_PORT,
        requestHost: body?.requestHost ?? req.headers.host,
      });
      const offer = await createPairingOffer({
        db: ctx.db,
        serverId: ctx.serverId,
        wsEndpoint,
        appBaseUrl: ctx.config.GAA_APP_BASE_URL,
        ttlSeconds: ctx.config.GAA_PAIRING_TOKEN_TTL_SECONDS,
      });
      json(res, 200, offer);
      return true;
    }

    if (method === "POST" && path === "/pairing/redeem") {
      const body = (await parseJson(req)) as { pairingToken?: string; clientName?: string } | null;
      const pairingToken = body?.pairingToken;
      if (!pairingToken || typeof pairingToken !== "string") {
        json(res, 400, { ok: false, code: "INVALID_REQUEST", message: "pairingToken required" });
        return true;
      }
      const redeemed = ctx.db.redeemPairingToken(pairingToken);
      if (!redeemed) {
        json(res, 400, {
          ok: false,
          code: "INVALID_PAIRING_TOKEN",
          message: "Pairing token invalid, expired, or already used",
        });
        return true;
      }
      const clientName = (body?.clientName as string | undefined) || "mobile-client";
      const authToken = randomBytes(ctx.config.GAA_AUTH_TOKEN_BYTES).toString("base64url");
      ctx.db.createAuthToken(authToken, clientName);
      json(res, 200, {
        ok: true,
        authToken,
        serverId: ctx.serverId,
        wsEndpoint: buildWsEndpoint({
          host: ctx.config.GAA_DAEMON_HOST,
          port: ctx.config.GAA_DAEMON_PORT,
          requestHost: req.headers.host,
        }),
      });
      return true;
    }

    if (method === "GET" && path === "/metrics") {
      const wsStats = ctx.hub.getStats();
      json(res, 200, {
        ok: true,
        now: new Date().toISOString(),
        serverId: ctx.serverId,
        ws: wsStats,
        agents: { total: ctx.manager.listAgents().length },
        projects: { total: ctx.db.listProjects().length },
        workspaces: { total: ctx.db.listWorkspaces().length },
        terminals: {
          total: ctx.terminalManager.listTerminals().length,
          running: ctx.terminalManager.listTerminals().filter((terminal) => terminal.status === "running").length,
        },
        permissions: { pending: ctx.db.listPermissionRequests("pending").length },
        schedules: {
          total: ctx.db.listSchedules().length,
          active: ctx.db.listSchedules().filter((schedule) => schedule.status === "active").length,
        },
        mcp: {
          total: ctx.db.listMcpServers().length,
          running: ctx.db.listMcpServers().filter((server) => server.status === "running").length,
        },
        relay: {
          total: ctx.db.listRelaySessions().length,
          connected: ctx.db.listRelaySessions().filter((session) => session.status === "connected").length,
        },
        voice: {
          total: ctx.db.listVoiceSessions().length,
          active: ctx.db.listVoiceSessions().filter((session) => session.status === "active").length,
        },
      });
      return true;
    }

    return false;
  };
}

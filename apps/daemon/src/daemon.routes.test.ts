import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Daemon } from "./daemon.js";

const runningDaemons: Daemon[] = [];

afterEach(() => {
  for (const daemon of runningDaemons.splice(0)) {
    try {
      daemon.stop();
    } catch {
      // no-op
    }
  }
});

function randomPort(): number {
  return 20000 + Math.floor(Math.random() * 10000);
}

describe("daemon route contracts", () => {
  it("serves health and enforces auth on protected route", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gaa-daemon-routes-"));
    const dbPath = join(dir, "daemon.db");
    const port = randomPort();
    const base = `http://127.0.0.1:${port}`;
    const daemon = new Daemon({
      GAA_DAEMON_HOST: "127.0.0.1",
      GAA_DAEMON_PORT: port,
      GAA_DB_PATH: dbPath,
    });
    runningDaemons.push(daemon);
    try {
      await daemon.start();
      const health = await fetch(base + "/health");
      expect(health.status).toBe(200);
      const healthBody = (await health.json()) as { ok?: boolean; serverId?: string };
      expect(healthBody.ok).toBe(true);
      expect(typeof healthBody.serverId).toBe("string");

      const agentsUnauthed = await fetch(base + "/agents");
      expect(agentsUnauthed.status).toBe(401);

      const offer = await fetch(base + "/pairing/offer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestHost: `127.0.0.1:${port}` }),
      });
      expect(offer.status).toBe(200);
      const offerBody = (await offer.json()) as { offer?: { pairingToken: string } };
      expect(typeof offerBody.offer?.pairingToken).toBe("string");

      const redeem = await fetch(base + "/pairing/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairingToken: offerBody.offer?.pairingToken, clientName: "route-test" }),
      });
      expect(redeem.status).toBe(200);
      const redeemBody = (await redeem.json()) as { authToken?: string };
      expect(typeof redeemBody.authToken).toBe("string");

      const agentsAuthed = await fetch(base + "/agents", {
        headers: { authorization: `Bearer ${redeemBody.authToken}` },
      });
      expect(agentsAuthed.status).toBe(200);
      const agentsBody = (await agentsAuthed.json()) as { agents?: unknown[] };
      expect(Array.isArray(agentsBody.agents)).toBe(true);
    } finally {
      daemon.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

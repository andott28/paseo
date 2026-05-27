import { WebSocket } from "ws";
import { PairingOfferSchema, decodePairingOfferFragment, type PairingOffer, type WsEnvelope } from "@gaa/protocol";
import { saveSession, type Session } from "../session/session-store.js";

export const DEFAULT_DAEMON_BASE = process.env.GAA_DAEMON_BASE ?? "http://127.0.0.1:9777";

export async function apiJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message ?? `Request failed: ${response.status}`);
  return body;
}

export function authHeaders(session: Session): HeadersInit {
  return { authorization: `Bearer ${session.authToken}` };
}

export function wsToHttpBase(wsEndpoint: string): string {
  const url = new URL(wsEndpoint);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "";
  return url.toString().replace(/\/$/, "");
}

export async function pair(base: string): Promise<void> {
  const offerResp = await apiJson(base + "/pairing/offer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestHost: new URL(base).host }),
  });
  const offer = PairingOfferSchema.parse(offerResp.offer) as PairingOffer;
  const encodedOffer = Buffer.from(JSON.stringify(offer), "utf8").toString("base64url");
  const decoded = decodePairingOfferFragment(encodedOffer);
  const redeemResp = await apiJson(base + "/pairing/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairingToken: decoded.pairingToken, clientName: "gaa-cli" }),
  });
  const session: Session = {
    serverId: redeemResp.serverId,
    authToken: redeemResp.authToken,
    wsEndpoint: redeemResp.wsEndpoint,
    httpBaseUrl: wsToHttpBase(redeemResp.wsEndpoint),
  };
  await saveSession(session);
  process.stdout.write(`paired ${session.serverId}\n`);
}

export async function sendWs(session: Session, envelope: WsEnvelope): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(session.wsEndpoint);
    let authed = false;
    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "hello", requestId: "cli_hello", payload: { authToken: session.authToken, clientName: "gaa-cli" } }));
    });
    ws.on("message", (msg) => {
      const env = JSON.parse(msg.toString()) as WsEnvelope;
      if (!authed && env.type === "welcome") {
        authed = true;
        ws.send(JSON.stringify(envelope));
        setTimeout(() => {
          ws.close();
          resolve();
        }, 60);
        return;
      }
      if (env.type === "error") reject(new Error((env.payload as any).message ?? "daemon error"));
    });
    ws.on("error", reject);
    ws.on("close", () => {
      if (!authed) reject(new Error("socket closed before auth"));
    });
  });
}

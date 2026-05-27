import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import {
  encodePairingOfferFragment,
  type PairingOffer,
  PairingOfferSchema,
} from "@gaa/protocol";
import type { DatabaseService } from "./db.js";

export interface PairingOfferResult {
  offer: PairingOffer;
  url: string;
  qr: string;
}

export function buildWsEndpoint(input: { host: string; port: number; requestHost?: string }): string {
  const chosenHost =
    input.requestHost && input.requestHost.length > 0
      ? input.requestHost.split(":")[0]!
      : input.host === "0.0.0.0"
        ? "127.0.0.1"
        : input.host;
  return "ws://" + chosenHost + ":" + input.port + "/ws";
}

export async function createPairingOffer(input: {
  db: DatabaseService;
  serverId: string;
  wsEndpoint: string;
  appBaseUrl: string;
  ttlSeconds: number;
}): Promise<PairingOfferResult> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString();
  input.db.createPairingToken(token, expiresAt);

  const offer = PairingOfferSchema.parse({
    v: 1,
    serverId: input.serverId,
    wsEndpoint: input.wsEndpoint,
    pairingToken: token,
    expiresAt,
  });
  const encoded = encodePairingOfferFragment(offer);
  const url = input.appBaseUrl.replace(/\/+$/, "") + "/#offer=" + encoded;
  const qr = await QRCode.toDataURL(url, { width: 256, margin: 2 });
  return { offer, url, qr };
}


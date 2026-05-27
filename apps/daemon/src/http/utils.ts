import type { IncomingMessage, ServerResponse } from "node:http";

const MIME_JSON = "application/json; charset=utf-8";

export function json(res: ServerResponse, status: number, data: object): void {
  res.writeHead(status, { "content-type": MIME_JSON });
  res.end(JSON.stringify(data));
}

export function extractBearerToken(req: IncomingMessage): string | null {
  const raw = req.headers.authorization;
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  const token = value.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function parseLimit(raw: string | null, fallback: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(1, Math.floor(n)), max);
}

export function parseJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function applyCors(res: ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, authorization");
}

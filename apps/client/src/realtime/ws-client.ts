import type { WsEnvelope } from "@gaa/protocol";

export function requestId(): string {
  return "req_" + Date.now() + "_" + Math.floor(Math.random() * 1_000_000);
}

export function sendEnvelope(socket: WebSocket | null, envelope: WsEnvelope): void {
  if (!socket || socket.readyState !== 1) throw new Error("Socket disconnected");
  socket.send(JSON.stringify(envelope));
}

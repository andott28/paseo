import type { AgentStreamEvent } from "@gaa/protocol";

export interface ProviderAvailability {
  available: boolean;
  reason?: string;
}

export interface ProviderSession {
  sessionId: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionInput {
  cwd: string;
  model?: string;
  title?: string;
}

export interface SendInput {
  sessionId: string;
  cwd: string;
  prompt: string;
  model?: string;
  signal?: AbortSignal;
}

export interface AgentProviderAdapter {
  id: string;
  isAvailable(): Promise<ProviderAvailability>;
  createSession(input: CreateSessionInput): Promise<ProviderSession>;
  send(input: SendInput): AsyncIterable<Omit<AgentStreamEvent, "id" | "agentId" | "seq" | "createdAt">>;
  stop(input: { sessionId: string }): Promise<void>;
  resume?(input: { sessionId: string; cwd: string }): Promise<void>;
}

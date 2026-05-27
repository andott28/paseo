import { describe, expect, it } from "vitest";
import { ProviderRegistry } from "./registry.js";
import type { AgentProviderAdapter } from "./types.js";

function provider(id: string): AgentProviderAdapter {
  return {
    id,
    async isAvailable() {
      return { available: true };
    },
    async createSession() {
      return { sessionId: `${id}-session` };
    },
    async *send() {
      yield { eventType: "system_status", text: `${id} ready`, marker: "m0" };
    },
    async stop() {
      return;
    },
  };
}

describe("ProviderRegistry", () => {
  it("returns registered provider", () => {
    const registry = new ProviderRegistry();
    registry.register(provider("codex"));
    expect(registry.get("codex").id).toBe("codex");
  });

  it("throws for unknown provider", () => {
    const registry = new ProviderRegistry();
    registry.register(provider("codex"));
    expect(() => registry.get("missing")).toThrow("Unknown provider");
  });
});

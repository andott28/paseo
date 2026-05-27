import type { AgentProviderAdapter, ProviderAvailability } from "./types.js";

export class ProviderRegistry {
  private readonly providers = new Map<string, AgentProviderAdapter>();

  register(provider: AgentProviderAdapter): void {
    this.providers.set(provider.id, provider);
  }

  get(providerId: string): AgentProviderAdapter {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(
        `Unknown provider '${providerId}'. Registered providers: ${Array.from(this.providers.keys()).join(", ")}`,
      );
    }
    return provider;
  }

  listProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  async getAvailabilitySnapshot(): Promise<Array<{ provider: string; availability: ProviderAvailability }>> {
    const entries = Array.from(this.providers.values());
    const snapshot: Array<{ provider: string; availability: ProviderAvailability }> = [];
    for (const provider of entries) {
      const availability = await provider.isAvailable();
      snapshot.push({
        provider: provider.id,
        availability,
      });
    }
    return snapshot;
  }
}

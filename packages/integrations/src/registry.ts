import type { IntegrationRegistryEntry } from './types';

export class IntegrationRegistry {
  private entries = new Map<string, IntegrationRegistryEntry>();

  register(entry: IntegrationRegistryEntry): void {
    this.entries.set(entry.name, entry);
  }

  get(name: string): IntegrationRegistryEntry | undefined {
    return this.entries.get(name);
  }

  getAll(): IntegrationRegistryEntry[] {
    return Array.from(this.entries.values());
  }
}

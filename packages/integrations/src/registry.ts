import { IntegrationError } from '@mariachi/core';
import type { IntegrationContext, IntegrationHandler, IntegrationRegistryEntry } from './types';

export class IntegrationRegistry {
  private readonly entries = new Map<string, IntegrationRegistryEntry>();
  private readonly handlers = new Map<string, IntegrationHandler>();
  private readonly ambiguous = new Set<string>();

  /**
   * Registers an integration and its handlers under `integration.fn`. A bare `fn` alias is also
   * registered unless another integration already uses that name. Every name in `functions`
   * must have a handler, so the registry never lists something it cannot call.
   */
  register(entry: IntegrationRegistryEntry): void {
    if (this.entries.has(entry.name)) {
      throw new IntegrationError('integrations/duplicate', `Integration ${entry.name} is already registered`);
    }
    const handlers = entry.handlers ?? {};
    const missing = entry.functions
      .map((fn) => (fn.startsWith(`${entry.name}.`) ? fn.slice(entry.name.length + 1) : fn))
      .filter((fn) => !handlers[fn]);
    if (missing.length > 0) {
      throw new IntegrationError('integrations/missing-handler', `Integration ${entry.name} lists functions without handlers: ${missing.join(', ')}`);
    }
    this.entries.set(entry.name, entry);
    for (const [fn, handler] of Object.entries(handlers)) {
      this.handlers.set(`${entry.name}.${fn}`, handler);
      if (this.ambiguous.has(fn)) continue;
      if (this.handlers.has(fn)) {
        this.handlers.delete(fn);
        this.ambiguous.add(fn);
      } else {
        this.handlers.set(fn, handler);
      }
    }
  }

  registerHandler(name: string, handler: IntegrationHandler): void {
    this.handlers.set(name, handler);
  }

  get(name: string): IntegrationRegistryEntry | undefined {
    return this.entries.get(name);
  }

  getAll(): IntegrationRegistryEntry[] {
    return Array.from(this.entries.values());
  }

  /** Runs a registered function by `integration.fn` or by the function name alone. */
  async call(name: string, input: unknown, ctx: IntegrationContext): Promise<unknown> {
    const handler = this.handlers.get(name);
    if (!handler && this.ambiguous.has(name)) {
      throw new IntegrationError('integrations/ambiguous-function', `${name} exists in several integrations; call it as integration.${name}`);
    }
    if (!handler) throw new IntegrationError('integrations/unknown-function', `No integration function named ${name}`);
    return handler(input, ctx);
  }
}

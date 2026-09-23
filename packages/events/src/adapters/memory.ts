import type { Logger } from '@mariachi/core';
import type { BusSubscribeOptions, BusSubscription, EnvelopeHandler, EventBus, EventEnvelope } from '../types';

interface Entry {
  handler: EnvelopeHandler;
  group?: string;
}

/**
 * In-process bus. `publish` resolves after every subscriber has run, which keeps tests deterministic.
 * Subscribers sharing a group take turns (round-robin), mirroring competing consumers.
 */
export class MemoryEventBus implements EventBus {
  readonly name = 'memory';
  readonly guarantee = 'at-most-once' as const;
  readonly published: EventEnvelope[] = [];
  private readonly subs = new Map<string, Set<Entry>>();
  private readonly cursors = new Map<string, number>();

  constructor(private readonly logger?: Logger) {}

  async publish(envelope: EventEnvelope): Promise<void> {
    this.published.push(envelope);
    const entries = [...(this.subs.get(envelope.type) ?? [])];
    const targets: Entry[] = entries.filter((e) => !e.group);
    const groups = new Map<string, Entry[]>();
    for (const e of entries) if (e.group) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);
    for (const [group, members] of groups) {
      const key = `${envelope.type}\u0000${group}`;
      const i = this.cursors.get(key) ?? 0;
      this.cursors.set(key, i + 1);
      targets.push(members[i % members.length]!);
    }
    await Promise.all(
      targets.map((e) =>
        e.handler(structuredClone(envelope), { attempt: 1 }).catch((error: unknown) => {
          this.logger?.error({ event: envelope.type, error: (error as Error).message }, 'memory bus delivery failed');
        }),
      ),
    );
  }

  subscribe(eventName: string, handler: EnvelopeHandler, options: BusSubscribeOptions = {}): BusSubscription {
    const entry: Entry = { handler, group: options.group };
    const set = this.subs.get(eventName) ?? new Set();
    set.add(entry);
    this.subs.set(eventName, set);
    return {
      ready: Promise.resolve(),
      unsubscribe: async () => {
        set.delete(entry);
      },
    };
  }

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

import type { BusSubscription, DeliveryInfo, EnvelopeHandler, EventBus, EventEnvelope } from '@mariachi/events';

export interface PublishedEvent<T = unknown> {
  eventName: string;
  payload: T;
  envelope: EventEnvelope<T>;
}

export class TestEventBus implements EventBus {
  readonly name = 'test';
  readonly guarantee = 'at-most-once' as const;
  private readonly handlers = new Map<string, Set<EnvelopeHandler>>();
  private readonly published: PublishedEvent[] = [];

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> { this.handlers.clear(); }
  async isHealthy(): Promise<boolean> { return true; }

  async publish<T>(envelope: EventEnvelope<T>): Promise<void> {
    this.published.push({ eventName: envelope.type, payload: envelope.payload, envelope });
    const set = this.handlers.get(envelope.type);
    if (!set) return;
    const delivery: DeliveryInfo = { attempt: 1 };
    for (const handler of set) await handler(envelope, delivery);
  }

  subscribe(eventName: string, handler: EnvelopeHandler): BusSubscription {
    let set = this.handlers.get(eventName);
    if (!set) {
      set = new Set();
      this.handlers.set(eventName, set);
    }
    set.add(handler);
    return {
      ready: Promise.resolve(),
      unsubscribe: async () => { set?.delete(handler); },
    };
  }

  getPublished<T = unknown>(): PublishedEvent<T>[] {
    return [...this.published] as PublishedEvent<T>[];
  }
}

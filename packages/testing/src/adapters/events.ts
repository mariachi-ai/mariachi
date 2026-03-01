import type { EventBus, EventHandler, TypedEvent } from '../types';

export interface PublishedEvent<T = unknown> {
  eventName: string;
  payload: T;
  envelope: TypedEvent<T>;
}

export class TestEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<EventHandler<unknown>>>();
  private readonly published: PublishedEvent[] = [];

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {
    this.handlers.clear();
  }

  async publish<T>(eventName: string, payload: T): Promise<void> {
    const envelope: TypedEvent<T> = {
      type: eventName,
      payload,
      occurredAt: new Date().toISOString(),
    };
    this.published.push({ eventName, payload, envelope });

    const set = this.handlers.get(eventName);
    if (!set?.size) return;
    for (const handler of set) {
      try {
        await handler(envelope.payload, undefined);
      } catch {
        // catch errors per handler
      }
    }
  }

  subscribe<T>(eventName: string, handler: EventHandler<T>): void {
    let set = this.handlers.get(eventName) as Set<EventHandler<T>> | undefined;
    if (!set) {
      set = new Set();
      this.handlers.set(eventName, set as Set<EventHandler<unknown>>);
    }
    set.add(handler as EventHandler<T>);
  }

  unsubscribe(eventName: string, handler: EventHandler): void {
    const set = this.handlers.get(eventName);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.handlers.delete(eventName);
  }

  getPublishedEvents<T = unknown>(): PublishedEvent<T>[] {
    return [...this.published] as PublishedEvent<T>[];
  }
}

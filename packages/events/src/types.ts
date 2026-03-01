import type { Context } from '@mariachi/core';

export interface EventBusConfig {
  adapter: string;
  url?: string;
  servers?: string[];
  prefix?: string;
  jetstream?: {
    stream: string;
    durableName?: string;
  };
}

export type EventHandler<T = unknown> = (event: T, ctx?: Context) => Promise<void>;

export interface EventBus {
  publish<T>(eventName: string, payload: T): Promise<void>;
  subscribe<T>(eventName: string, handler: EventHandler<T>): void;
  unsubscribe(eventName: string, handler: EventHandler): void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface TypedEvent<T = unknown> {
  type: string;
  payload: T;
  occurredAt: string;
  traceId?: string;
  tenantId?: string;
}

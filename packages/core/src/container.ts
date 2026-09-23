import { MariachiError } from './errors';

/** A typed container key. The phantom `__type` carries the registered value's type. */
export interface ServiceKey<T> {
  readonly id: symbol;
  readonly name: string;
  readonly __type?: T;
}

export type AnyKey<T = unknown> = ServiceKey<T> | string | symbol;

export function createKey<T>(name: string): ServiceKey<T> {
  return { id: Symbol.for(`mariachi.${name}`), name };
}

function toId(key: AnyKey): string | symbol {
  if (typeof key === 'object') return key.id;
  return key;
}

function toName(key: AnyKey): string {
  if (typeof key === 'object') return key.name;
  return String(key);
}

export interface Container {
  register<T>(key: ServiceKey<T>, instance: T): void;
  register<T>(key: string | symbol, instance: T): void;
  resolve<T>(key: ServiceKey<T>): T;
  resolve<T>(key: string | symbol): T;
  tryResolve<T>(key: ServiceKey<T>): T | undefined;
  tryResolve<T>(key: string | symbol): T | undefined;
  has(key: AnyKey): boolean;
  unregister(key: AnyKey): void;
  /** Creates a child container. Lookups fall through to the parent; registrations stay local. */
  createScope(): Container;
  clear(): void;
}

export function createContainer(parent?: Container): Container {
  const store = new Map<string | symbol, unknown>();

  const container: Container = {
    register(key: AnyKey, instance: unknown): void {
      store.set(toId(key), instance);
    },

    resolve(key: AnyKey): any {
      const id = toId(key);
      if (store.has(id)) return store.get(id);
      if (parent?.has(key)) return parent.resolve(key as string);
      throw new MariachiError('container/not-registered', `Container: no registration found for key "${toName(key)}"`, {
        key: toName(key),
      });
    },

    tryResolve(key: AnyKey): any {
      const id = toId(key);
      if (store.has(id)) return store.get(id);
      return parent?.tryResolve(key as string);
    },

    has(key: AnyKey): boolean {
      return store.has(toId(key)) || (parent?.has(key) ?? false);
    },

    unregister(key: AnyKey): void {
      store.delete(toId(key));
    },

    createScope(): Container {
      return createContainer(container);
    },

    clear(): void {
      store.clear();
    },
  };

  return container;
}

/**
 * Well-known keys. Each `id` is `Symbol.for('mariachi.<name>')`, so values registered
 * with the legacy raw-symbol keys still resolve.
 */
export const KEYS = {
  Config: createKey<unknown>('config'),
  Logger: createKey<import('./context').Logger>('logger'),
  Tracer: createKey<import('./instrumentable').TracerAdapter>('tracer'),
  Metrics: createKey<import('./instrumentable').MetricsAdapter>('metrics'),
  ErrorTracker: createKey<unknown>('errortracker'),
  Secrets: createKey<unknown>('secrets'),
  Database: createKey<unknown>('database'),
  Cache: createKey<unknown>('cache'),
  EventBus: createKey<unknown>('eventbus'),
  JobQueue: createKey<unknown>('jobqueue'),
  Auth: createKey<unknown>('auth'),
  Authorization: createKey<unknown>('authorization'),
  Storage: createKey<unknown>('storage'),
  Notifications: createKey<unknown>('notifications'),
  Billing: createKey<unknown>('billing'),
  Search: createKey<unknown>('search'),
  AI: createKey<unknown>('ai'),
  Communication: createKey<unknown>('communication'),
  Lifecycle: createKey<unknown>('lifecycle'),
  RateLimit: createKey<unknown>('ratelimit'),
  Audit: createKey<unknown>('audit'),
  Tenancy: createKey<unknown>('tenancy'),
  Realtime: createKey<unknown>('realtime'),
  FeatureFlags: createKey<unknown>('featureflags'),
  Encryption: createKey<unknown>('encryption'),
} as const;

let globalContainer = createContainer();

export function getContainer(): Container {
  return globalContainer;
}

/** Replaces the global container (tests). Returns the previous one. */
export function setContainer(container: Container): Container {
  const previous = globalContainer;
  globalContainer = container;
  return previous;
}

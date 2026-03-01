const registry = new Map<string | symbol, unknown>();

export interface Container {
  register<T>(key: string | symbol, instance: T): void;
  resolve<T>(key: string | symbol): T;
  has(key: string | symbol): boolean;
  clear(): void;
}

export function createContainer(): Container {
  const store = new Map<string | symbol, unknown>();

  return {
    register<T>(key: string | symbol, instance: T): void {
      store.set(key, instance);
    },

    resolve<T>(key: string | symbol): T {
      const instance = store.get(key);
      if (instance === undefined) {
        throw new Error(`Container: no registration found for key "${String(key)}"`);
      }
      return instance as T;
    },

    has(key: string | symbol): boolean {
      return store.has(key);
    },

    clear(): void {
      store.clear();
    },
  };
}

export const KEYS = {
  Config: Symbol.for('mariachi.config'),
  Logger: Symbol.for('mariachi.logger'),
  Tracer: Symbol.for('mariachi.tracer'),
  Metrics: Symbol.for('mariachi.metrics'),
  Database: Symbol.for('mariachi.database'),
  Cache: Symbol.for('mariachi.cache'),
  EventBus: Symbol.for('mariachi.eventbus'),
  JobQueue: Symbol.for('mariachi.jobqueue'),
  Auth: Symbol.for('mariachi.auth'),
  Authorization: Symbol.for('mariachi.authorization'),
  Storage: Symbol.for('mariachi.storage'),
  Notifications: Symbol.for('mariachi.notifications'),
  Billing: Symbol.for('mariachi.billing'),
  Search: Symbol.for('mariachi.search'),
  AI: Symbol.for('mariachi.ai'),
  Communication: Symbol.for('mariachi.communication'),
  Lifecycle: Symbol.for('mariachi.lifecycle'),
  RateLimit: Symbol.for('mariachi.ratelimit'),
  Audit: Symbol.for('mariachi.audit'),
  Tenancy: Symbol.for('mariachi.tenancy'),
  Realtime: Symbol.for('mariachi.realtime'),
} as const;

const globalContainer = createContainer();

export function getContainer(): Container {
  return globalContainer;
}

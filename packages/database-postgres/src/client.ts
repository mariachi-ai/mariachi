import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { ConfigError, type Context } from '@mariachi/core';
import type { DatabaseConfig } from '@mariachi/database';
import { PostgresAdapter } from './adapter';
import { withTransaction, type TransactionOptions } from './transaction';

export type DrizzleInstance = PostgresJsDatabase<Record<string, never>>;

export interface PostgresDatabase {
  adapter: PostgresAdapter;
  readonly db: DrizzleInstance;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isHealthy: () => Promise<boolean>;
  transaction: <T>(ctx: Context, fn: () => Promise<T>, options?: TransactionOptions) => Promise<T>;
}

export function createPostgresDatabase(config: Omit<DatabaseConfig, 'adapter'>): PostgresDatabase {
  const adapter = new PostgresAdapter({ ...config, adapter: 'postgres' });
  return {
    adapter,
    get db() {
      return adapter.getClient<DrizzleInstance>();
    },
    connect: () => adapter.connect(),
    disconnect: () => adapter.disconnect(),
    isHealthy: () => adapter.ping(),
    transaction: (ctx, fn, options) => withTransaction(adapter.getClient<DrizzleInstance>(), ctx, () => fn(), options),
  };
}

/** @deprecated Use `createPostgresDatabase` instead. */
export function createDatabase(config: DatabaseConfig) {
  if (config.adapter !== 'postgres') {
    throw new ConfigError('database/unsupported-adapter', `Unsupported database adapter: ${config.adapter}`);
  }
  const result = createPostgresDatabase(config);
  return {
    client: result.adapter,
    get db() {
      return result.db;
    },
    connect: result.connect,
    disconnect: result.disconnect,
  };
}

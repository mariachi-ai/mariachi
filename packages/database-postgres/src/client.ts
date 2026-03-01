import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { DatabaseAdapter, DatabaseConfig } from '@mariachi/database';
import { PostgresAdapter } from './adapter';

export type DrizzleInstance = PostgresJsDatabase<Record<string, never>>;

export function createPostgresDatabase(config: Omit<DatabaseConfig, 'adapter'>): {
  adapter: DatabaseAdapter;
  db: DrizzleInstance;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
} {
  const adapter = new PostgresAdapter({ ...config, adapter: 'postgres' });
  return {
    adapter,
    get db() {
      return adapter.getClient<DrizzleInstance>();
    },
    connect: () => adapter.connect(),
    disconnect: () => adapter.disconnect(),
  };
}

/**
 * @deprecated Use `createPostgresDatabase` instead.
 * Kept for backward compatibility with code using the old `createDatabase` API.
 */
export function createDatabase(config: DatabaseConfig): {
  client: DatabaseAdapter;
  db: DrizzleInstance;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
} {
  if (config.adapter !== 'postgres') {
    throw new Error(`Unsupported database adapter: ${config.adapter}. Use @mariachi/database-postgres only for PostgreSQL.`);
  }
  const result = createPostgresDatabase(config);
  return {
    client: result.adapter,
    db: result.db,
    connect: result.connect,
    disconnect: result.disconnect,
  };
}

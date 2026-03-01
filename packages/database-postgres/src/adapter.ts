import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { DatabaseAdapter, DatabaseConfig } from '@mariachi/database';

export class PostgresAdapter implements DatabaseAdapter {
  private sql: ReturnType<typeof postgres> | null = null;
  private _db: PostgresJsDatabase | null = null;
  private connected = false;

  constructor(private readonly config: DatabaseConfig) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    this.sql = postgres(this.config.url, {
      max: this.config.poolMax ?? 10,
      idle_timeout: 20,
    });
    this._db = drizzle({ client: this.sql });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.sql) return;
    await this.sql.end();
    this.sql = null;
    this._db = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getClient<T = PostgresJsDatabase>(): T {
    if (!this._db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this._db as T;
  }
}

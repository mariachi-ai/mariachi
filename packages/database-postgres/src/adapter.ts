import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DatabaseError } from '@mariachi/core';
import type { DatabaseAdapter, DatabaseConfig } from '@mariachi/database';

export class PostgresAdapter implements DatabaseAdapter {
  private sql: ReturnType<typeof postgres> | null = null;
  private _db: PostgresJsDatabase | null = null;

  constructor(private readonly config: DatabaseConfig) {}

  async connect(): Promise<void> {
    if (this.sql) return;
    const ssl = this.config.ssl === true ? 'require' : this.config.ssl === false ? false : this.config.ssl;
    this.sql = postgres(this.config.url, {
      max: this.config.poolMax ?? 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl,
      onnotice: () => {},
      connection: {
        application_name: this.config.applicationName ?? 'mariachi',
        statement_timeout: this.config.statementTimeoutMs ?? 30_000,
      },
    });
    this._db = drizzle({ client: this.sql });
    try {
      await this.sql`select 1`;
    } catch (cause) {
      await this.sql.end({ timeout: 1 }).catch(() => undefined);
      this.sql = null;
      this._db = null;
      throw new DatabaseError('database/connect-failed', 'Could not connect to Postgres', { cause });
    }
  }

  async disconnect(): Promise<void> {
    if (!this.sql) return;
    await this.sql.end({ timeout: 5 });
    this.sql = null;
    this._db = null;
  }

  isConnected(): boolean {
    return this.sql !== null;
  }

  async ping(): Promise<boolean> {
    if (!this.sql) return false;
    try {
      await this.sql`select 1`;
      return true;
    } catch {
      return false;
    }
  }

  /** Raw postgres.js client, for migrations and admin tasks. */
  get raw(): ReturnType<typeof postgres> {
    if (!this.sql) throw new DatabaseError('database/not-connected', 'Database not connected. Call connect() first.');
    return this.sql;
  }

  getClient<T = PostgresJsDatabase>(): T {
    if (!this._db) throw new DatabaseError('database/not-connected', 'Database not connected. Call connect() first.');
    return this._db as T;
  }
}

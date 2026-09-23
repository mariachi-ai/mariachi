import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import { createContext, DatabaseError, type Context, type Logger } from '@mariachi/core';
import type { SeedDefinition } from '@mariachi/database';
import type { PostgresAdapter } from './adapter';
import type { DrizzleDb } from './transaction';

const MIGRATION_LOCK = 72_616_263; // arbitrary constant advisory-lock key

/**
 * Applies pending drizzle-kit migrations. Holds a Postgres advisory lock so concurrent deploys
 * don't race; safe to call on every boot.
 */
export async function runMigrations(adapter: PostgresAdapter, options: { migrationsFolder: string; logger?: Logger }): Promise<void> {
  const raw = adapter.raw;
  const reserved = await raw.reserve();
  try {
    await reserved`select pg_advisory_lock(${MIGRATION_LOCK})`;
    options.logger?.info({ folder: options.migrationsFolder }, 'running database migrations');
    await migrate(adapter.getClient<DrizzleDb>(), { migrationsFolder: options.migrationsFolder });
  } catch (cause) {
    throw new DatabaseError('database/migration-failed', 'Database migration failed', { cause });
  } finally {
    await reserved`select pg_advisory_unlock(${MIGRATION_LOCK})`.catch(() => undefined);
    reserved.release();
  }
}

export interface RunSeedsOptions {
  /** Current environment; seeds with `environments` not including it are skipped. */
  environment: string;
  logger: Logger;
  /** Re-run seeds even if recorded. */
  force?: boolean;
  ctx?: Context;
}

/**
 * Runs seeds in order, once each, recording them in `_mariachi_seeds`. By default seeds do not run
 * in production unless they list it in `environments`.
 */
export async function runSeeds(db: DrizzleDb, seeds: SeedDefinition<DrizzleDb>[], options: RunSeedsOptions): Promise<string[]> {
  await db.execute(sql`create table if not exists _mariachi_seeds (name text primary key, ran_at timestamptz not null default now())`);
  const ran: string[] = [];
  const ctx = options.ctx ?? createContext({ logger: options.logger, identityType: 'system' });
  for (const seed of seeds) {
    const allowed = seed.environments ? seed.environments.includes(options.environment) : options.environment !== 'production';
    if (!allowed) continue;
    const done = await db.execute(sql`select 1 from _mariachi_seeds where name = ${seed.name}`);
    if ((done as unknown as unknown[]).length > 0 && !options.force) continue;
    options.logger.info({ seed: seed.name }, 'running seed');
    await db.transaction(async (tx) => {
      await seed.run(ctx, tx as unknown as DrizzleDb);
      await tx.execute(sql`insert into _mariachi_seeds (name) values (${seed.name}) on conflict (name) do update set ran_at = now()`);
    });
    ran.push(seed.name);
  }
  return ran;
}

/** @deprecated use runSeeds */
export async function runSeed(db: DrizzleDb, seeds: SeedDefinition<DrizzleDb>[] = [], logger?: Logger): Promise<string[]> {
  const log: Logger = logger ?? { info() {}, warn() {}, error() {}, debug() {}, child: () => log };
  return runSeeds(db, seeds, { environment: 'development', logger: log });
}

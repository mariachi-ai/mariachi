import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { getSlot, retry, runWithSlot } from '@mariachi/core';
import type { Context } from '@mariachi/core';
import { isPgError, mapPgError } from './errors';

export type DrizzleDb = PostgresJsDatabase<Record<string, never>>;
type Tx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

const TX_SLOT = Symbol.for('mariachi.database.tx');

/** The active transaction for this async scope, or undefined. */
export function currentTransaction(): Tx | undefined {
  return getSlot<Tx>(TX_SLOT);
}

export interface TransactionOptions {
  isolationLevel?: 'read committed' | 'repeatable read' | 'serializable';
  /** Retry serialization failures/deadlocks. Default 3 attempts for serializable, else 1. */
  attempts?: number;
}

/**
 * Runs `fn` in a transaction. Every `DrizzleRepository` call made inside (at any depth) joins it
 * automatically. Nested calls reuse the outer transaction.
 */
export async function withTransaction<T>(
  db: DrizzleDb,
  _ctx: Context,
  fn: (tx: Tx) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const existing = currentTransaction();
  if (existing) return fn(existing);
  const attempts = options.attempts ?? (options.isolationLevel === 'serializable' ? 3 : 1);
  return retry(
    async () => {
      try {
        // Passing `{ isolationLevel: undefined }` makes drizzle emit an empty `SET TRANSACTION`.
        const config = options.isolationLevel ? { isolationLevel: options.isolationLevel } : undefined;
        return await db.transaction((tx) => runWithSlot(TX_SLOT, tx, () => fn(tx)), config);
      } catch (error) {
        throw isPgError(error) ? mapPgError(error, 'transaction') : error;
      }
    },
    {
      attempts,
      backoff: 'exponential',
      baseDelayMs: 20,
      maxDelayMs: 500,
      jitter: true,
      retryOn: (err) => (err as { code?: string }).code === 'database/serialization-failure',
    },
  );
}

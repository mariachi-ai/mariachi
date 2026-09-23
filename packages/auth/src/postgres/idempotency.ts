import { eq, lte } from 'drizzle-orm';
import type { IdempotencyClaim, IdempotencyStore } from '@mariachi/core';
import { compileTable, type DrizzleDb } from '@mariachi/database-postgres';
import { authWebhookDedupTable } from '../schema/webhook-dedup';

const dedup = compileTable(authWebhookDedupTable);

/** Database-backed webhook dedup. Pass this to `createAuthWebhookDispatcher`. */
export class DrizzleWebhookDedup implements IdempotencyStore {
  constructor(private readonly db: DrizzleDb) {}

  /** One conditional upsert, so concurrent deliveries of the same event cannot both claim it. */
  async claim(key: string, ttlMs: number): Promise<IdempotencyClaim> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    const claimed = await this.db
      .insert(dedup)
      .values({ key, state: 'processing', expiresAt })
      .onConflictDoUpdate({ target: dedup.key, set: { state: 'processing', expiresAt }, setWhere: lte(dedup.expiresAt, now) })
      .returning({ key: dedup.key });
    if (claimed.length > 0) return 'claimed';
    const [current] = await this.db.select({ state: dedup.state }).from(dedup).where(eq(dedup.key, key)).limit(1);
    return current?.state === 'done' ? 'completed' : 'in-progress';
  }

  async complete(key: string, ttlMs: number): Promise<void> {
    await this.db.update(dedup).set({ state: 'done', expiresAt: new Date(Date.now() + ttlMs) }).where(eq(dedup.key, key));
  }

  async release(key: string): Promise<void> {
    await this.db.delete(dedup).where(eq(dedup.key, key));
  }
}

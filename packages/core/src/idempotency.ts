/**
 * Cross-process deduplication for webhooks, jobs and other at-least-once inputs.
 * Implementations: `RedisIdempotencyStore` (@mariachi/cache), `TestIdempotencyStore` (@mariachi/testing).
 */
export type IdempotencyClaim = 'claimed' | 'in-progress' | 'completed';

export interface IdempotencyStore {
  /**
   * Atomically claims `key` while it is being processed. Returns `'claimed'` if the caller
   * owns it, `'in-progress'` if another worker holds it, `'completed'` if it already succeeded.
   */
  claim(key: string, ttlMs: number): Promise<IdempotencyClaim>;
  /** Marks `key` as successfully processed for `ttlMs`. */
  complete(key: string, ttlMs: number): Promise<void>;
  /** Releases a claim after a failure so a retry can process it. */
  release(key: string): Promise<void>;
}

/** Single-process store for tests and local development. Not safe across instances. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, { state: 'processing' | 'done'; expiresAt: number }>();

  async claim(key: string, ttlMs: number): Promise<IdempotencyClaim> {
    const now = Date.now();
    const cur = this.entries.get(key);
    if (cur && cur.expiresAt > now) return cur.state === 'done' ? 'completed' : 'in-progress';
    this.entries.set(key, { state: 'processing', expiresAt: now + ttlMs });
    return 'claimed';
  }

  async complete(key: string, ttlMs: number): Promise<void> {
    this.entries.set(key, { state: 'done', expiresAt: Date.now() + ttlMs });
  }

  async release(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

/**
 * Runs `fn` at most once per `key`. If `fn` throws, the claim is released so the sender's
 * retry is processed instead of being dropped as a duplicate.
 */
export async function runOnce<T>(
  store: IdempotencyStore,
  key: string,
  fn: () => Promise<T>,
  options: { processingTtlMs?: number; completedTtlMs?: number } = {},
): Promise<{ status: 'processed'; result: T } | { status: 'duplicate' | 'in-progress' }> {
  const claim = await store.claim(key, options.processingTtlMs ?? 5 * 60_000);
  if (claim === 'completed') return { status: 'duplicate' };
  if (claim === 'in-progress') return { status: 'in-progress' };
  try {
    const result = await fn();
    await store.complete(key, options.completedTtlMs ?? 7 * 24 * 60 * 60_000);
    return { status: 'processed', result };
  } catch (error) {
    await store.release(key);
    throw error;
  }
}

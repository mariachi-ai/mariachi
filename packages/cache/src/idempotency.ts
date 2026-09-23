import type Redis from 'ioredis';
import type { IdempotencyStore, IdempotencyClaim } from '@mariachi/core';

const CLAIM_SCRIPT = `
  local cur = redis.call("get", KEYS[1])
  if cur == "done" then return "completed" end
  if cur then return "in-progress" end
  redis.call("set", KEYS[1], "processing", "PX", ARGV[1])
  return "claimed"
`;

/** Redis-backed `IdempotencyStore` for webhook and job deduplication across instances. */
export class RedisIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly client: Redis,
    private readonly prefix = 'mariachi:idem',
  ) {}

  private k(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async claim(key: string, ttlMs: number): Promise<IdempotencyClaim> {
    return (await this.client.eval(CLAIM_SCRIPT, 1, this.k(key), String(ttlMs))) as IdempotencyClaim;
  }

  async complete(key: string, ttlMs: number): Promise<void> {
    await this.client.set(this.k(key), 'done', 'PX', ttlMs);
  }

  async release(key: string): Promise<void> {
    await this.client.del(this.k(key));
  }
}

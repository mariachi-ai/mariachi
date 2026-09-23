import type { CacheClient } from '@mariachi/cache';
import { AuthError } from '@mariachi/core';

export interface BruteForceConfig {
  maxAttempts: number;
  windowSeconds: number;
  lockoutSeconds: number;
}

export const DEFAULT_BRUTE_FORCE_CONFIG: BruteForceConfig = {
  maxAttempts: 5,
  windowSeconds: 300,
  lockoutSeconds: 900,
};

/**
 * Tracks failed attempts per identifier (email, IP, api key prefix) with an atomic counter, so
 * parallel guesses cannot race past `maxAttempts`.
 */
export class BruteForceProtector {
  constructor(
    private readonly cache: CacheClient,
    private readonly config: BruteForceConfig = DEFAULT_BRUTE_FORCE_CONFIG,
  ) {}

  private attemptsKey(identifier: string) {
    return `auth:attempts:${identifier}`;
  }

  private lockKey(identifier: string) {
    return `auth:lockout:${identifier}`;
  }

  async check(identifier: string): Promise<void> {
    if (await this.cache.has(this.lockKey(identifier))) {
      const retryAfter = await this.cache.ttl(this.lockKey(identifier));
      throw new AuthError('auth/account-locked', 'Too many failed attempts; try again later', {
        retryAfterSeconds: retryAfter > 0 ? retryAfter : this.config.lockoutSeconds,
      });
    }
  }

  /** Records a failure and returns the attempt count. Locks the identifier at `maxAttempts`. */
  async recordFailure(identifier: string): Promise<number> {
    const attempts = await this.cache.incr(this.attemptsKey(identifier), 1, this.config.windowSeconds);
    if (attempts >= this.config.maxAttempts) {
      await this.cache.setIfAbsent(this.lockKey(identifier), 1, this.config.lockoutSeconds);
    }
    return attempts;
  }

  async reset(identifier: string): Promise<void> {
    await this.cache.del(this.attemptsKey(identifier));
    await this.cache.del(this.lockKey(identifier));
  }

  /** Runs `attempt`; failures (thrown errors) are counted, success resets the counter. */
  async guard<T>(identifier: string, attempt: () => Promise<T>): Promise<T> {
    await this.check(identifier);
    try {
      const result = await attempt();
      await this.reset(identifier);
      return result;
    } catch (error) {
      await this.recordFailure(identifier);
      throw error;
    }
  }
}

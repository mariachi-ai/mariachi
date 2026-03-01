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

export class BruteForceProtector {
  constructor(
    private readonly cache: CacheClient,
    private readonly config: BruteForceConfig = DEFAULT_BRUTE_FORCE_CONFIG,
  ) {}

  async check(identifier: string): Promise<void> {
    const lockKey = `auth:lockout:${identifier}`;
    const locked = await this.cache.get<string>(lockKey);
    if (locked) {
      throw new AuthError('auth/account-locked', `Account locked for ${this.config.lockoutSeconds} seconds`);
    }
  }

  async recordFailure(identifier: string): Promise<void> {
    const key = `auth:attempts:${identifier}`;
    const current = await this.cache.get<number>(key) ?? 0;
    const attempts = current + 1;
    await this.cache.set(key, attempts, this.config.windowSeconds);

    if (attempts >= this.config.maxAttempts) {
      const lockKey = `auth:lockout:${identifier}`;
      await this.cache.set(lockKey, '1', this.config.lockoutSeconds);
    }
  }

  async reset(identifier: string): Promise<void> {
    await this.cache.del(`auth:attempts:${identifier}`);
    await this.cache.del(`auth:lockout:${identifier}`);
  }
}

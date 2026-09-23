import type { RateLimiter, RateLimitResult, RateLimitRule } from '../types';

/** Single-process limiter for development and tests. Not shared across instances. */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    if (rule.algorithm === 'token-bucket') return this.tokenBucket(key, rule);
    const now = this.now();
    const cost = rule.cost ?? 1;
    const fixed = rule.algorithm === 'fixed-window';
    const windowStart = fixed ? now - (now % rule.windowMs) : now - rule.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => (fixed ? t >= windowStart : t > windowStart));
    const resetAt = fixed ? windowStart + rule.windowMs : (list[0] ?? now) + rule.windowMs;
    if (list.length + cost > rule.maxRequests) {
      this.hits.set(key, list);
      return {
        allowed: false,
        limit: rule.maxRequests,
        remaining: Math.max(0, rule.maxRequests - list.length),
        resetAt: new Date(resetAt),
        retryAfterMs: Math.max(0, resetAt - now),
      };
    }
    for (let i = 0; i < cost; i++) list.push(now);
    this.hits.set(key, list);
    return { allowed: true, limit: rule.maxRequests, remaining: rule.maxRequests - list.length, resetAt: new Date(resetAt), retryAfterMs: 0 };
  }

  private tokenBucket(key: string, rule: RateLimitRule): RateLimitResult {
    const now = this.now();
    const cost = rule.cost ?? 1;
    const capacity = rule.maxRequests;
    const rate = capacity / rule.windowMs;
    const current = this.buckets.get(key) ?? { tokens: capacity, updatedAt: now };
    const tokens = Math.min(capacity, current.tokens + Math.max(0, now - current.updatedAt) * rate);
    if (tokens < cost) {
      this.buckets.set(key, { tokens, updatedAt: now });
      const retryAfterMs = Math.ceil((cost - tokens) / rate);
      return { allowed: false, limit: capacity, remaining: Math.floor(tokens), resetAt: new Date(now + retryAfterMs), retryAfterMs };
    }
    const next = tokens - cost;
    this.buckets.set(key, { tokens: next, updatedAt: now });
    return { allowed: true, limit: capacity, remaining: Math.floor(next), resetAt: new Date(now + Math.ceil((capacity - next) / rate)), retryAfterMs: 0 };
  }

  async reset(key: string): Promise<void> {
    this.hits.delete(key);
    this.buckets.delete(key);
  }
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async isHealthy(): Promise<boolean> {
    return true;
  }
}

import Redis from 'ioredis';
import type { RateLimiter, RateLimitResult, RateLimitRule } from '../types';

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])
local windowStart = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
local count = redis.call('ZCARD', key)

if count >= maxRequests then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetAt = now + windowMs
  if oldest and #oldest > 0 then
    resetAt = tonumber(oldest[2]) + windowMs
  end
  return {0, 0, resetAt}
end

local member = now .. '-' .. tostring(math.random())
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs + 60000)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local resetAt = now + windowMs
if oldest and #oldest > 0 then
  resetAt = tonumber(oldest[2]) + windowMs
end
local remaining = maxRequests - count - 1
return {1, remaining, resetAt}
`;

export class RedisRateLimiter implements RateLimiter {
  private redis: Redis | null = null;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    this.redis = new Redis(this.url);
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const redis = this.redis;
    if (!redis) {
      throw new Error('RedisRateLimiter not connected');
    }

    const now = Date.now();
    const result = (await redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      `ratelimit:${key}`,
      String(now),
      String(rule.windowMs),
      String(rule.maxRequests),
    )) as [number, number, number];

    const [allowed, remaining, resetAtMs] = result;
    const resetAt = new Date(resetAtMs);
    const retryAfterMs = Math.max(0, resetAtMs - now);

    return {
      allowed: allowed === 1,
      remaining,
      resetAt,
      retryAfterMs,
    };
  }
}

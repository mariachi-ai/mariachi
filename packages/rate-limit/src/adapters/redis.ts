import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { RateLimitError } from '@mariachi/core';
import type { RateLimitConfig, RateLimiter, RateLimitResult, RateLimitRule } from '../types';

// Uses Redis server TIME so instances with skewed clocks share one timeline.
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local windowMs = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local seq = ARGV[4]
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
local count = redis.call('ZCARD', key)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local resetAt = now + windowMs
if oldest and #oldest > 0 then resetAt = tonumber(oldest[2]) + windowMs end
if count + cost > maxRequests then
  return {0, math.max(0, maxRequests - count), resetAt, now}
end
for i = 1, cost do
  redis.call('ZADD', key, now, seq .. ':' .. i)
end
redis.call('PEXPIRE', key, windowMs)
return {1, maxRequests - count - cost, resetAt, now}
`;

// Window start and count live in one hash at KEYS[1], so `reset` can delete it and the script
// touches only its declared key (required for Redis Cluster).
const FIXED_WINDOW_SCRIPT = `
local windowMs = tonumber(ARGV[1])
local maxRequests = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local windowStart = now - (now % windowMs)
local resetAt = windowStart + windowMs
local data = redis.call('HMGET', KEYS[1], 'w', 'c')
local current = 0
if tonumber(data[1]) == windowStart then current = tonumber(data[2]) or 0 end
if current + cost > maxRequests then
  return {0, math.max(0, maxRequests - current), resetAt, now}
end
current = current + cost
redis.call('HSET', KEYS[1], 'w', windowStart, 'c', current)
redis.call('PEXPIREAT', KEYS[1], resetAt)
return {1, maxRequests - current, resetAt, now}
`;

const TOKEN_BUCKET_SCRIPT = `
local capacity = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if not tokens then tokens = capacity end
if not ts then ts = now end
local elapsed = math.max(0, now - ts)
tokens = math.min(capacity, tokens + elapsed * (capacity / windowMs))
local allowed = 0
local retry = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry = math.ceil((cost - tokens) * windowMs / capacity)
end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], windowMs * 2)
-- Denied: when the next token arrives. Allowed: when the bucket is full again.
local resetAt = now + retry
if allowed == 1 then resetAt = now + math.ceil((capacity - tokens) * windowMs / capacity) end
return {allowed, math.floor(tokens), resetAt, now}
`;

export class RedisRateLimiter implements RateLimiter {
  private readonly redis: Redis;
  private readonly ownsClient: boolean;
  private readonly prefix: string;
  private seq = 0;
  private readonly instanceId = randomUUID();

  constructor(config: Pick<RateLimitConfig, 'url' | 'client' | 'prefix'> | string = {}) {
    const cfg = typeof config === 'string' ? { url: config } : config;
    this.redis = cfg.client ?? new Redis(cfg.url ?? 'redis://localhost:6379', { lazyConnect: true, maxRetriesPerRequest: 3 });
    this.ownsClient = !cfg.client;
    this.prefix = cfg.prefix ?? 'ratelimit';
  }

  async connect(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }

  async disconnect(): Promise<void> {
    if (this.ownsClient && this.redis.status !== 'end' && this.redis.status !== 'wait') await this.redis.quit();
  }

  async isHealthy(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`${this.prefix}:${key}`);
  }

  async check(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const cost = rule.cost ?? 1;
    const tokenBucket = rule.algorithm === 'token-bucket';
    const script = rule.algorithm === 'fixed-window'
      ? FIXED_WINDOW_SCRIPT
      : tokenBucket
        ? TOKEN_BUCKET_SCRIPT
        : SLIDING_WINDOW_SCRIPT;
    const member = `${this.instanceId}:${this.seq++}`;
    let result: [number, number, number, number];
    try {
      result = (await this.redis.eval(
        script,
        1,
        `${this.prefix}:${key}`,
        String(tokenBucket ? rule.maxRequests : rule.windowMs),
        String(tokenBucket ? rule.windowMs : rule.maxRequests),
        String(cost),
        member,
      )) as [number, number, number, number];
    } catch (cause) {
      throw new RateLimitError('rate-limit/backend-failed', 'Rate limit backend unavailable', { cause });
    }
    const [allowed, remaining, resetAtMs, now] = result;
    return {
      allowed: allowed === 1,
      limit: rule.maxRequests,
      remaining: Math.max(0, remaining),
      resetAt: new Date(resetAtMs),
      retryAfterMs: allowed === 1 ? 0 : Math.max(0, resetAtMs - now),
    };
  }
}

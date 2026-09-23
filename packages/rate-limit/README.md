# @mariachi/rate-limit

Rate limiting on Redis (shared across instances, using Redis server time) or in memory, with
sliding window, fixed window and token bucket algorithms, weighted requests and per-tenant tiers.
`@mariachi/api-facade` applies it per route; use `DefaultRateLimiting` for quotas anywhere else.

**Status: beta.** Covered by unit tests and Redis integration tests. The API can change before 1.0.

Guide: [http.md](../core/docs/http.md#rate-limits)

## Public API

| Export | Purpose |
| --- | --- |
| `createRateLimiter(config)` | `RedisRateLimiter` or `MemoryRateLimiter`: `check(key, rule)`, `reset(key)` |
| `DefaultRateLimiting` | `check`, `consume` (throws on excess), `checkTier`, `consumeTier`, with instrumentation |
| `createRateLimitMiddleware`, `defaultRateLimitKey` | Middleware for custom servers |
| `RateLimitRule`, `RateLimitTier`, `TierResolver`, `RateLimitResult` | Types |

## Config

| Option | Notes |
| --- | --- |
| `adapter` | `'redis'` or `'memory'` |
| `url` / `client` | Redis URL (from `REDIS_URL`), or an existing ioredis client |
| `prefix` | Key prefix, default `ratelimit` |

A rule is `{ windowMs, maxRequests, algorithm?, cost? }`, with `algorithm` one of `'sliding-window'`
(default), `'fixed-window'` or `'token-bucket'`. `DefaultRateLimiting` also takes `resolveTier(ctx)`
to pick a tenant's tier. Errors are `RateLimitError`: `rate-limit/exceeded` (429, with
`retryAfterSeconds`), `rate-limit/unknown-tier`, `rate-limit/backend-failed` (503).

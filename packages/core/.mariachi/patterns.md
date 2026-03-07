# Mariachi Core Patterns

## 1. Adapter Factory

Every external dependency is behind an adapter. A factory function selects the implementation from config.

```ts
const cache = createCache({ adapter: 'redis', url: process.env.REDIS_URL });
const search = createSearch({ adapter: 'typesense', ... });
const jobQueue = createJobQueue({ adapter: 'bullmq', redisUrl: ... }, logger);
```

Production adapters: Redis, PostgreSQL, Stripe, Typesense, BullMQ, Resend, S3, OpenAI.
Test doubles live in `@mariachi/testing` (e.g. `TestCacheClient`, `TestEventBus`).

## 2. Abstract Service Class

Each package exposes: `X` (abstract) → `DefaultX extends X`. The abstract class layers observability, error handling, and hooks on top of raw adapters.

```ts
export abstract class Notifications implements Instrumentable { ... }
export class DefaultNotifications extends Notifications { ... }
```

Subclass `DefaultX` when custom behavior is needed.

## 3. Instrumentable & Disposable

Two interfaces from `@mariachi/core` that every service implements:

- **Instrumentable**: `{ logger, tracer?, metrics? }` — pulled from the DI container
- **Disposable**: `{ connect(), disconnect(), isHealthy() }` — lifecycle management

## 4. DI Container

Global container via `getContainer()` with well-known `KEYS`:

```ts
import { getContainer, KEYS } from '@mariachi/core';
const container = getContainer();
container.register(KEYS.Logger, logger);
const logger = container.resolve<Logger>(KEYS.Logger);
```

`bootstrap()` registers `Config` and `Logger` automatically. Other services register themselves as needed.

## 5. Context Propagation

Every operation receives a `Context` carrying identity and tracing:

```ts
interface Context {
  traceId: string;
  userId: string | null;
  tenantId: string | null;
  scopes: string[];
  identityType: string;
  logger: Logger;
}
```

Never lose context between layers. Pass `ctx` through communication calls, service methods, and event handlers.

## 6. Zod Schemas at Boundaries

Validate at entry points, not deep in business logic:

- **Controller**: parse request body with Zod before calling communication
- **Handler registration**: declare `schema: { input, output }` with Zod schemas
- **Job definition**: declare `schema` for job payload
- **Config**: `AppConfigSchema` validates all configuration at load time

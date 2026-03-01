# Mariachi AI Guide

Concise reference for AI assistants generating code on the Mariachi framework. For quick lookups, see the [`.mariachi/`](../.mariachi/) rule files (architecture, patterns, conventions, packages). For step-by-step instructions, see the [recipes](./recipes/).

---

## Architecture

Three-layer request flow:

```
HTTP → Facade (FastifyAdapter, auth, rate limit)
     → Controller (Zod validation, communication.call())
     → Service (business logic, DB, cache, events)
```

Apps map to layers:

| App | Layer | Purpose |
|-----|-------|---------|
| `apps/api` | Facade + Controller | HTTP servers, controllers, auth |
| `apps/services` | Service | Domain logic, handler registration |
| `apps/worker` | Background | BullMQ job workers, schedules |

See [`docs/architecture.md`](./architecture.md) for diagrams.

---

## Decision Tree: Which Component to Use

**"I need to handle an HTTP request"**
→ Add a controller in `apps/api/src/controllers/` extending `BaseController`. Register on a server in `apps/api/src/index.ts`.

**"I need to run business logic"**
→ Create a service in `apps/services/src/<domain>/`. Register a handler via `communication.register()`. Call it from a controller via `communication.call('<domain>.<action>', ctx, input)`.

**"I need to run something in the background"**
→ Define a job in `apps/worker/src/jobs/` with a Zod schema and retry config. Enqueue via `jobQueue.enqueue(jobName, data)` from a service.
→ See [`docs/recipes/add-background-job.md`](./recipes/add-background-job.md).

**"I need to react to something that happened"**
→ Use the event bus: `eventBus.publish('user.created', payload)` and `eventBus.subscribe('user.created', handler)`. Adapter: Redis pub/sub or NATS.

**"I need to run something on a schedule"**
→ Add a schedule entry in `apps/worker/src/jobs/schedules.ts`: `{ name, cron, jobName, data }`.

**"I need to cache data"**
→ Use `cache.getOrSet(key, ttl, fetchFn)` from `@mariachi/cache`. Redis-backed.

**"I need to store files"**
→ Use `@mariachi/storage` with S3 adapter.

**"I need real-time updates"**
→ Use `@mariachi/realtime` with `WSAdapter`. Supports channels, broadcast, and per-user messaging.

**"I need to accept webhooks from a third party"**
→ Create a `WebhookController` in `apps/api/`. Choose `mode: 'direct'` (sync via communication) or `mode: 'queue'` (async via jobs).
→ See [`docs/recipes/add-webhook-endpoint.md`](./recipes/add-webhook-endpoint.md).

**"I need to integrate with an external service"**
→ Use `defineIntegrationFn()` from `@mariachi/integrations`. See [`docs/recipes/add-integration.md`](./recipes/add-integration.md).

**"I need to wire up and bootstrap an app from scratch"**
→ See [`docs/recipes/wiring-and-bootstrap.md`](./recipes/wiring-and-bootstrap.md). Shows the full initialization sequence from config to running servers, with DI container registration order and startup/shutdown priorities.

**"I need to add a new domain entity end-to-end"**
→ See [`docs/recipes/add-domain-entity.md`](./recipes/add-domain-entity.md).

---

## Package Cheat Sheet

### bootstrap (lifecycle)

```ts
import { bootstrap } from '@mariachi/lifecycle';
const { config, logger, startup, shutdown, health } = bootstrap();
startup.register({ name: 'my-service', priority: 10, fn: async () => { ... } });
await startup.runAll(logger);
```

### communication

```ts
import { createCommunication } from '@mariachi/communication';
const communication = createCommunication();

// Register a handler (in apps/services)
communication.register('users.create', {
  schema: { input: CreateUserInput, output: UserOutput },
  handler: (ctx, input) => UsersService.create(ctx, input),
});

// Call a handler (in apps/api controller)
const result = await communication.call('users.create', ctx, input);
```

### controller (api-facade)

```ts
import { BaseController, type HttpContext } from '@mariachi/api-facade';

export class OrdersController extends BaseController {
  readonly prefix = 'orders';

  init() {
    this.post(this.buildPath(), this.create);
    this.get(this.buildPath(':id'), this.getById);
  }

  create = async (ctx: HttpContext, body: unknown) => {
    const input = CreateOrderInput.parse(body);
    return communication.call('orders.create', ctx, input);
  };
}
```

### server (api-facade)

```ts
import { FastifyAdapter } from '@mariachi/api-facade';

const server = new FastifyAdapter({ name: 'public' })
  .withAuth(['session', 'api-key'])
  .withRateLimit({ perUser: 1000, perApiKey: 5000, window: '1h' });

server.registerController(new OrdersController());
await server.listen(3000);
```

### database schema

```ts
import { defineTable } from '@mariachi/database';
import { column } from '@mariachi/database';

export const ordersTable = defineTable('orders', {
  id:        column.uuid().primaryKey().defaultRandom(),
  tenantId:  column.text().notNull(),
  userId:    column.text().notNull(),
  total:     column.numeric().notNull(),
  status:    column.text().notNull(),
  createdAt: column.timestamp().notNull().defaultNow(),
  updatedAt: column.timestamp().notNull().defaultNow(),
  deletedAt: column.timestamp(),
});
```

### repository (database-postgres)

```ts
import { DrizzleRepository } from '@mariachi/database-postgres';
import { orders } from '../compiled-schemas';

export class DrizzleOrdersRepository extends DrizzleRepository<Order> {
  constructor(db: DrizzleDb) {
    super(orders, db, { tenantColumn: 'tenantId' });
  }
}
```

Inherited methods: `findById`, `findMany`, `create`, `update`, `softDelete`, `hardDelete`, `paginate`, `count`.

### jobs

```ts
import { z } from 'zod';

export const ProcessOrderJob = {
  name: 'orders.process',
  schema: z.object({ orderId: z.string() }),
  retry: { attempts: 3, backoff: 'exponential' as const },
  handler: async (data, ctx) => { ... },
};
```

### events

```ts
const eventBus = createEventBus({ adapter: 'redis', url: process.env.REDIS_URL });
await eventBus.publish('order.created', { orderId: '123' });
await eventBus.subscribe('order.created', async (event) => { ... });
```

### cache

```ts
const cache = createCache({ adapter: 'redis', url: process.env.REDIS_URL });
const user = await cache.getOrSet(
  cache.key('users', userId),
  3600,
  () => repo.findById(ctx, userId),
);
```

### testing

```ts
import { createTestHarness, createTestContext, TestRepository } from '@mariachi/testing';

const harness = createTestHarness();
const ctx = createTestContext();
const repo = new TestRepository<User>();
```

---

## Common Gotchas

1. **Communication handlers must be registered before `call()`**. In a monolith, call `registerServiceHandlers(communication)` from `apps/services` before starting the API server.

2. **No in-memory job adapter exists**. The worker app references `'memory'` as a fallback but `@mariachi/jobs` only implements BullMQ. Use `@mariachi/testing`'s `TestJobQueue` in tests.

3. **`createCommunication()` returns an `InProcessAdapter`**. There is no gRPC/HTTP transport adapter yet. The communication layer is in-process only.

4. **Soft deletes are the default**. `DrizzleRepository.softDelete()` sets `deletedAt`. All queries automatically filter out soft-deleted rows. Use `hardDelete()` only when explicitly needed.

5. **Tenant isolation is automatic in `DrizzleRepository`**. When `tenantColumn` is set and `ctx.tenantId` is present, all queries are scoped to that tenant.

6. **`bootstrap()` registers Config and Logger in the DI container**. Other services pull them via `getContainer().resolve(KEYS.Logger)`. You don't need to pass logger explicitly to services that extend `Instrumentable`.

7. **Controller route handlers receive `(ctx, body, params, query)`**. Don't destructure the Fastify request directly -- use the controller's handler signature.

8. **CORE_CONCEPT.md describes planned features**. Some adapters listed there (MySQL, SQLite, MongoDB, gRPC, tRPC, GraphQL) are not implemented. This guide reflects actual code only.

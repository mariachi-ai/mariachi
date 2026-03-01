# Recipe: Wiring and Bootstrap

This shows the full initialization sequence for a Mariachi application -- from loading config to accepting requests. Understanding the wiring order is critical because components depend on each other: communication handlers must be registered before controllers call them, and infrastructure (DB, Redis) must connect before services that use them.

---

## Initialization Order

```
1. Load config              loadConfig() or bootstrap()
2. Create observability     createObservability() → logger, tracer, metrics
3. Register in container    container.register(KEYS.Logger, logger) etc.
4. Create infrastructure    createPostgresDatabase(), createCache(), createEventBus()
5. Register infra in DI     container.register(KEYS.Database, db) etc.
6. Create communication     createCommunication()
7. Register handlers        registerServiceHandlers(communication)
8. Create servers           new FastifyAdapter() with auth + rate limiting
9. Register controllers     server.registerController(new XxxController())
10. Connect infra           startup hooks: db.connect(), cache.connect()
11. Start servers           server.listen(port)
```

Steps 6-7 must happen before 8-9. If a controller calls `communication.call('users.create', ...)` but no handler is registered for `users.create`, it will fail at runtime.

---

## Minimal Bootstrap (apps/api pattern)

The simplest wiring uses `bootstrap()` from `@mariachi/lifecycle`, which handles steps 1-3:

```ts
import { bootstrap } from '@mariachi/lifecycle';
import { createCommunication } from '@mariachi/communication';
import { registerServiceHandlers } from '@mariachi/services';
import { FastifyAdapter } from '@mariachi/api-facade';
import { UsersController } from './controllers/users.controller';

async function main() {
  // Steps 1-3: config, observability, DI container
  const { logger, startup, shutdown } = bootstrap();

  // Step 6: communication layer
  const communication = createCommunication();

  // Step 7: register all service handlers
  registerServiceHandlers(communication);

  // Steps 8-9: servers and controllers
  const server = new FastifyAdapter({ name: 'public' })
    .withAuth(['session', 'api-key'])
    .withRateLimit({ perUser: 1000, perApiKey: 5000, window: '1h' });

  server.registerController(new UsersController());

  // Steps 10-11: connect and start
  startup.register({
    name: 'server',
    priority: 100,
    fn: async () => {
      await server.listen(3000);
      logger.info({ port: 3000 }, 'Server started');
    },
  });

  shutdown.register({
    name: 'server',
    priority: 100,
    fn: () => server.close(),
  });

  await startup.runAll(logger);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Reference:** `apps/api/src/index.ts`

---

## Full Bootstrap (with all infrastructure)

For a production app that needs database, cache, events, auth, and billing:

```ts
import { getContainer, KEYS } from '@mariachi/core';
import { loadConfig } from '@mariachi/config';
import { createObservability } from '@mariachi/observability';
import { bootstrap } from '@mariachi/lifecycle';
import { createPostgresDatabase } from '@mariachi/database-postgres';
import { createCache } from '@mariachi/cache';
import { createEventBus } from '@mariachi/events';
import { createAuth, createAuthorization } from '@mariachi/auth';
import { createRateLimiter } from '@mariachi/rate-limit';
import { createCommunication } from '@mariachi/communication';

async function main() {
  // 1. Config
  const config = loadConfig();

  // 2. Observability
  const { logger, tracer, metrics } = createObservability({
    logging: { adapter: 'pino', level: 'info' },
  });

  // 3. DI container
  const container = getContainer();
  container.register(KEYS.Config, config);
  container.register(KEYS.Logger, logger);
  container.register(KEYS.Tracer, tracer);
  container.register(KEYS.Metrics, metrics);

  // 4-5. Infrastructure + register in container
  const db = createPostgresDatabase({ url: config.database.url });
  container.register(KEYS.Database, db);

  const cache = createCache({ adapter: 'redis', url: config.redis!.url });
  container.register(KEYS.Cache, cache);

  const events = createEventBus({ adapter: 'redis', url: config.redis!.url });
  container.register(KEYS.EventBus, events);

  const auth = createAuth({ adapter: 'jwt', jwtSecret: config.auth!.jwtSecret! });
  container.register(KEYS.Auth, auth);

  const rateLimiter = createRateLimiter({ adapter: 'redis', url: config.redis!.url });
  container.register(KEYS.RateLimit, rateLimiter);

  // Lifecycle managers
  const { startup, shutdown, health } = bootstrap();

  // 6-7. Communication + handlers
  const communication = createCommunication();
  container.register(KEYS.Communication, communication);
  registerServiceHandlers(communication);

  // 8-9. Servers + controllers
  const publicServer = new FastifyAdapter({ name: 'public' })
    .withAuth(['session', 'api-key'])
    .withRateLimit({ perUser: 1000, perApiKey: 5000, window: '1h' });

  publicServer.registerController(new UsersController());
  publicServer.registerController(new OrdersController());

  // 10. Connect infrastructure (lower priority = runs first)
  startup.register({ name: 'database', priority: 1, fn: () => db.connect() });
  startup.register({ name: 'cache', priority: 2, fn: () => cache.connect() });
  startup.register({ name: 'events', priority: 3, fn: () => events.connect() });

  // 11. Start servers (higher priority = runs later)
  startup.register({ name: 'servers', priority: 100, fn: async () => {
    await publicServer.listen(3000);
    logger.info({ port: 3000 }, 'Server started');
  }});

  // Shutdown in reverse order
  shutdown.register({ name: 'servers', priority: 1, fn: () => publicServer.close() });
  shutdown.register({ name: 'events', priority: 10, fn: () => events.disconnect() });
  shutdown.register({ name: 'cache', priority: 20, fn: () => cache.disconnect() });
  shutdown.register({ name: 'database', priority: 30, fn: () => db.disconnect() });

  await startup.runAll(logger);
}
```

**Reference:** `examples/api/src/bootstrap.ts`

---

## Startup/Shutdown Priorities

Hooks run in order of priority (lowest first). Convention:

| Priority | Phase | What |
|----------|-------|------|
| 1-10 | Infrastructure | Database, cache, event bus connections |
| 50 | Services | Communication handler registration, event subscribers |
| 100 | Servers | HTTP server listen, WebSocket server start |

For shutdown, use the inverse: stop servers first (priority 1), then services, then infrastructure.

---

## Worker Bootstrap

Workers follow the same pattern but with job queues instead of HTTP servers:

```ts
import { bootstrap } from '@mariachi/lifecycle';
import { createJobQueue } from '@mariachi/jobs';
import { SendEmailJob } from './jobs/send-email.job';
import { schedules } from './jobs/schedules';

const { config, logger, startup, shutdown } = bootstrap();

const jobQueue = createJobQueue({
  adapter: 'bullmq',
  redisUrl: config.redis!.url,
}, logger);

jobQueue.registerJob(SendEmailJob);
for (const schedule of schedules) {
  jobQueue.register(schedule);
}

startup.register({
  name: 'job-queue',
  priority: 10,
  fn: async () => {
    await jobQueue.connect();
    await jobQueue.start();
  },
});

shutdown.register({
  name: 'job-queue',
  priority: 10,
  fn: async () => {
    await jobQueue.stop();
    await jobQueue.disconnect();
  },
});

startup.runAll(logger).catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
```

**Reference:** `apps/worker/src/index.ts`

---

## DI Container Keys

All well-known keys are defined in `@mariachi/core`:

```ts
import { KEYS } from '@mariachi/core';

KEYS.Config          // AppConfig
KEYS.Logger          // Logger
KEYS.Tracer          // TracerAdapter
KEYS.Metrics         // MetricsAdapter
KEYS.Database        // Database / PostgresAdapter
KEYS.Cache           // Cache / CacheClient
KEYS.EventBus        // EventBus
KEYS.JobQueue        // JobQueue
KEYS.Auth            // Auth
KEYS.Authorization   // Authorization
KEYS.Storage         // Storage
KEYS.Notifications   // Notifications
KEYS.Billing         // Billing
KEYS.Search          // Search
KEYS.AI              // AI
KEYS.Communication   // CommunicationLayer
KEYS.Lifecycle       // Lifecycle
KEYS.RateLimit       // RateLimiter
KEYS.Audit           // Audit
KEYS.Tenancy         // Tenancy
KEYS.Realtime        // Realtime
```

Services that extend `Instrumentable` automatically resolve `Logger`, `Tracer`, and `Metrics` from the container. You only need to register them once during bootstrap.

---

## Checklist

- [ ] Config loaded and validated
- [ ] Logger + tracer + metrics created and registered in container
- [ ] Infrastructure created (DB, cache, events) and registered in container
- [ ] Communication layer created
- [ ] Service handlers registered on communication layer
- [ ] Servers created with auth and rate limiting
- [ ] Controllers registered on servers
- [ ] Startup hooks registered (infra connect at low priority, servers at high priority)
- [ ] Shutdown hooks registered (reverse order)
- [ ] `startup.runAll(logger)` called

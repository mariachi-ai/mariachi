# Recipe: wiring and bootstrap

`mariachi init` generates `src/main.ts`, a working composition root. This recipe explains its order and
shows how to add resources and split processes.

## Order

```
1. bootstrap()                    config (validated), logger, tracer, metrics, error tracker, secrets,
                                  container registrations, signal handlers
2. resources                      lifecycle.manage(name, resource, { priority })
                                  database 10 → cache 15 → jobs/events 20 → ...
3. communication                  createCommunication(); register it as KEYS.Communication
4. services + handlers            registerServices(communication, deps)
5. transports                     API server, webhook server, WebSocket adapter, job worker
                                  (startup hooks with priority ≥ 90)
6. lifecycle.start()              runs startup hooks in ascending priority, then marks the process started
```

Shutdown (SIGTERM/SIGINT) runs the hooks in reverse: transports stop accepting work first, then jobs
drain, then connections close. Readiness (`/api/health/ready`) reports unhealthy while starting and
while draining, so load balancers stop routing before connections close.

## The generated main.ts, annotated

```ts
const { config, logger, tracer, metrics, container, lifecycle } = bootstrap();
const instrumentation = { logger, tracer, metrics };

// Fail at boot, not on the first request.
if (!config.database) throw new ConfigError('app/database-required', 'DATABASE_URL is required');

const database = lifecycle.manage('database', createPostgresDatabase({ url: config.database.url }), { priority: 10 });

const jobs = new DefaultJobs({ queue: createJobQueue({ adapter: 'bullmq', redisUrl: config.redis.url, prefix: config.serviceName }, logger) }, instrumentation);
for (const job of jobDefinitions) jobs.registerJob(job);
lifecycle.manage('jobs', jobs, { priority: 20 });
lifecycle.startup.register({ name: 'jobs-worker', priority: 90, fn: () => jobs.start() });

const communication = createCommunication({}, instrumentation);
container.register(KEYS.Communication, communication);
registerServices(communication, { db: database.db, jobs });

const api = createApiServer({ name: 'api', prefix: '/api', logger, tracer })
  .withAuthStrategy('session', bearerStrategy(new JWTAdapter({ secret: config.auth.jwtSecret })))
  .withAuth('session')
  .withHealth(lifecycle.health)
  .withOpenApi({ info: { title: config.serviceName, version: '0.1.0' } });
for (const controller of createControllers(communication)) api.registerController(controller);
lifecycle.startup.register({ name: 'api', priority: 100, fn: () => api.listen(config.server.port, config.server.host) });
lifecycle.shutdown.register({ name: 'api', priority: 100, fn: () => api.close() });

await lifecycle.start();
```

Handlers are registered before any transport starts, so no request can reach an unregistered
procedure. A controller calling a name nobody registered fails with `communication/not-found`.

## Adding resources

Add each resource to `ServiceDeps` in `src/services/index.ts` and pass it in from `main.ts`.

```ts
const cacheConfig = { adapter: 'redis', url: config.redis.url, prefix: config.serviceName };
const cache = lifecycle.manage(
  'cache',
  new DefaultCache({ client: createCache(cacheConfig), lock: createLock(cacheConfig) }, instrumentation), // lock enables stampede protection
  { priority: 15 },
);

const bus = lifecycle.manage('event-bus', createEventBus({ adapter: 'redis-streams', url: config.redis.url }), { priority: 20 });
const events = new DefaultEvents({ bus, source: config.serviceName }, instrumentation);

lifecycle.manage('outbox-relay', new OutboxRelay({ db: database.db, target: events, logger }), { priority: 95 });
```

Components that accept an existing client (`client: redis`) never close it; the owner closes it.
Mark a resource `{ critical: false }` when readiness should report `degraded` instead of `unhealthy`
if it's down (a search index, for example).

## Splitting API and worker

Keep one `src/bootstrap.ts` that builds resources and registers services, then two entry points:

- `src/api.ts`: bootstrap, then the API server. Don't call `jobs.start()`; it enqueues only.
- `src/worker.ts`: bootstrap, register all job definitions and schedules, then `jobs.start()`. No HTTP
  server except a health endpoint if your platform needs one.

Both processes register the same handlers, so jobs call services directly or through
`communication.call`, exactly like controllers.

## Tests

```ts
const app = bootstrapForTest({ config: { serviceName: 'test' } });   // fresh container, no signal handlers, env ignored
const communication = createCommunication();
registerServices(communication, { db, jobs: new DefaultJobs({ queue: createJobQueue({ adapter: 'memory' }, app.logger) }) });
// ... communication.call(ctx, 'notes.create', input)
app.restore();
```

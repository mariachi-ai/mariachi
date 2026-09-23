# Testing

Unit tests use `@mariachi/testing`: in-memory doubles, factories and a harness. Integration tests
run against real Postgres, Redis, Typesense and S3 (MinIO) through Testcontainers. The doubles are
only useful if they behave like the real adapters, so shared contract suites check both.

## Unit tests

```ts
import { createTestHarness, TestEmailAdapter } from '@mariachi/testing';

const harness = createTestHarness();                  // test logger, tracer and metrics in a fresh DI container
const ctx = harness.ctx({ tenantId: 't1', userId: 'u1' });
const email = new TestEmailAdapter();
const notifications = new DefaultNotifications({ email }, harness.deps);

await notifications.notify(ctx, intent);
expect(email.getSentEmails()[0]?.subject).toBe('Invoice 42 is ready');
```

| Double | Stands in for | Notes |
| --- | --- | --- |
| `TestCacheClient` | `CacheClient` (Redis) | The memory cache: TTLs, atomic `incr`, prefix-scoped `keys` and `flush`. |
| `TestLock` | `DistributedLock` | Tokens, expiry, owned locks. |
| `TestStorageClient` | `StorageClient` | The memory adapter's key validation; URLs on `test.example.com`. |
| `TestSearchClient` | `SearchClient` | The memory search adapter. |
| `TestInAppStore` | `InAppNotificationStore` | The memory inbox. |
| `TestEmailAdapter`, `TestSMSAdapter`, `TestPushAdapter` | notification channels | Record what was sent. |
| `TestJobQueue` | `JobQueue` + worker | `drain()` runs queued jobs through their registered handlers. |
| `TestEventBus`, `TestRepository`, `TestAISession`, `TestTracer`, `TestMetrics` | events, repositories, AI, observability | Record calls for assertions. |

Types come from the real packages, so a double that drifts from its interface fails to compile.

## Contract suites

Each adapter interface has one suite in `packages/testing/src/contracts/`, run against every
implementation:

| Suite | Unit run (`contracts.test.ts`) | Integration run (`contracts.integration.test.ts`) |
| --- | --- | --- |
| `storageContract` | memory, local disk, `TestStorageClient` | S3 on MinIO |
| `searchContract` | memory, `TestSearchClient` | Typesense |
| `inboxContract` | memory, `TestInAppStore` | Postgres (`DrizzleNotificationStore`) |
| `cacheContract` | memory, `TestCacheClient` | Redis |
| `lockContract` | `TestLock` | Redis |

When you change an adapter's behavior, change the suite first; whichever side you didn't update
then fails. When you add an adapter, add a line that runs the suite against it.

## Integration tests

Files named `*.integration.test.ts` run with `pnpm test:integration` (one package at a time).
`test/setup.ts` starts what a test needs:

```ts
import { startPostgres, startRedis, startTypesense, startMinio, stopAll } from '../../../test/setup';

beforeAll(async () => {
  database = createPostgresDatabase({ url: await startPostgres() });
  await database.connect();
  await applySchema(database.db, [auditLogsTable]);
}, 180_000);
afterAll(() => stopAll());
```

Each helper uses `DATABASE_URL`, `REDIS_URL`, `TYPESENSE_URL` or `S3_ENDPOINT` when set (CI service
containers, `docker compose -f docker-compose.dev.yml up`) and otherwise starts a throwaway
container. MinIO has no CI service (it needs a command argument), so it always runs through
Testcontainers there. CI shares one database across packages, so tests should use unique ids or
keys (`crypto.randomUUID()`) instead of assuming empty tables.

The domain packages that talk to infrastructure all have one: billing, notifications, ai, audit
and auth (Postgres), config feature flags (Postgres), rate-limit (Redis), search (Typesense) and
storage (MinIO).

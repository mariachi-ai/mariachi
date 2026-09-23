# @mariachi/testing

Test doubles, factories and a harness for unit tests without infrastructure. The doubles are kept
honest by contract suites that run the same assertions against the real adapters (Postgres, Redis,
Typesense, S3 on MinIO) and against the doubles.

**Status: beta.** The doubles pass the contract suites in both unit and integration runs. The API
can change before 1.0.

Guide: [testing.md](../core/docs/testing.md)

## Public API

| Export | Purpose |
| --- | --- |
| `createTestHarness()` | Fresh DI container with `TestHarnessLogger`, `TestTracer` and `TestMetrics`; `harness.ctx()` and `harness.deps` |
| `createTestContext`, `createTestUser`, `createTestTenant`, `createTestSetup` | Factories |
| `TestCacheClient`, `TestLock` | Cache and distributed lock |
| `TestStorageClient`, `TestSearchClient`, `TestInAppStore` | Storage, search and in-app inbox (share the memory adapters' behavior) |
| `TestEmailAdapter`, `TestSMSAdapter`, `TestPushAdapter` | Record sent messages |
| `TestJobQueue` | `drain()` runs queued jobs through their handlers |
| `TestEventBus`, `TestRepository`, `TestAISession`, `TestTracer`, `TestMetrics` | Record calls for assertions |

## Config

None. Doubles take the same constructor options as the adapters they stand in for (for example
`new TestCacheClient({ prefix })`). Integration tests use `test/setup.ts` in this repository; see the
guide.

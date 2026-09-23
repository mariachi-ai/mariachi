# Core patterns

## Composition root

One function builds the object graph: `src/main.ts` in a generated project. Nothing else constructs
infrastructure. The order is:

1. `bootstrap()`: loads and validates config, creates logger/tracer/metrics/error tracker, registers
   them in the container, installs signal handlers.
2. Resources, registered with `lifecycle.manage(name, resource, { priority })`, connect at start and
   disconnect in reverse order at shutdown.
3. One `createCommunication()` per process, then every service's handlers.
4. Transports (API server, job worker, webhook server) last, so they only accept work once everything
   they call is up.
5. `await lifecycle.start()`.

The full walkthrough is in [recipes/wiring-and-bootstrap.md](./recipes/wiring-and-bootstrap.md).

## DI container and typed keys

The container is a registry for things resolved at runtime (the logger in a hook, the communication
layer in a controller factory). Constructors still take their dependencies explicitly.

```ts
import { createKey, getContainer, KEYS } from '@mariachi/core';

const PaymentsClient = createKey<PaymentsClient>('payments-client');
getContainer().register(PaymentsClient, new PaymentsClient(options));
const client = getContainer().resolve(PaymentsClient); // typed as PaymentsClient
```

`KEYS` holds the framework keys (`KEYS.Config`, `KEYS.Logger`, `KEYS.Communication`, ...).
`resolve` throws on a missing key and `tryResolve` returns `undefined`. `createScope()` creates a child
container, and `bootstrapForTest()` installs a fresh container and returns `restore()`.

## Context

```ts
interface Context {
  traceId: string;
  userId: string | null;
  tenantId: string | null;
  scopes: string[];
  identityType: string; // 'user' | 'api-key' | 'service' | 'webhook' | 'job' | 'system' ...
  logger: Logger;       // child logger bound to traceId/tenantId/userId
}
```

HTTP servers build it from the request (identity from the auth strategy, `traceId` from the W3C
`traceparent` header or the request id). Jobs and events carry a serialized copy in their envelope.
Pass it explicitly as the first argument. `runWithContext(ctx, fn)` / `currentContext()` exist for code
you can't change the signature of (logging hooks, ORM callbacks); they aren't a substitute for passing
`ctx`.

## Abstract service classes and hooks

Infrastructure packages expose `X` (abstract, instrumented) and `DefaultX` (ready to use). The
abstract class adds spans, metrics, error normalization and hook methods on top of the raw adapter.
Subclass to react to lifecycle points without wrapping every call:

```ts
class AppJobs extends DefaultJobs {
  protected async onJobFailed(ctx: Context, event: JobFailureEvent) {
    if (event.final) await alerts.notify(ctx, `${event.jobName} dead-lettered`);
  }
}
```

## Disposable and lifecycle

Anything holding a connection implements `Disposable`, `{ connect(), disconnect(), isHealthy() }`.
`lifecycle.manage` wires all three into startup, shutdown and readiness. Clients passed in by the caller
(a shared ioredis client, for example) are never closed by the component that borrowed them.

## Adapter factory

```ts
const cache = createCache({ adapter: config.env === 'test' ? 'memory' : 'redis', url: config.redis?.url });
```

The factory is the only place that maps config to an implementation. Vendor SDKs are optional peer
dependencies loaded on first use.

## Idempotency

External inputs arrive more than once: webhooks are retried, jobs are redelivered, events are
at-least-once. Wrap side effects with `runOnce(store, key, fn)`, which returns
`{ status: 'processed', result }`, `{ status: 'duplicate' }` or `{ status: 'in-progress' }`. Use
`RedisIdempotencyStore` from `@mariachi/cache` in production and `InMemoryIdempotencyStore` in tests. Jobs also dedup at enqueue time with
`enqueueWithDedup(ctx, name, data, key)`.

## Retries and timeouts

`retry(fn, { attempts, backoff, baseDelayMs, retryOn })` and `withTimeout(promise, ms)` from core are
used by every package. Retry only transient failures: `retryOn` should reject validation, auth and
other 4xx-class errors.

## Result type

`Result<T, E>` (`ok`, `err`, `tryCatch`, `map`, ...) is available for expected failures in pure logic.
Across layers, throw typed errors instead; the HTTP envelope and job/event retry logic are built on
them.

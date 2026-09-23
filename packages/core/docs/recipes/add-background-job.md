# Recipe: add a background job

Goal: send an order confirmation email outside the request, at most once per order, with retries.

## 1. Generate and define

```bash
mariachi generate job send-order-confirmation
```

`src/jobs/send-order-confirmation.job.ts`:

```ts
import { defineJob } from '@mariachi/jobs';
import { z } from 'zod';

export const sendOrderConfirmationJob = defineJob({
  name: 'send-order-confirmation',
  schema: z.object({ orderId: z.string().uuid() }),
  retry: { attempts: 5, backoff: 'exponential', delay: 1_000 },
  timeoutMs: 30_000,
  nonRetryableCodes: ['not-found'],        // a deleted order won't come back; don't retry
  handler: async (ctx, data) => {
    const order = await orders.getById(ctx, data.orderId);   // same tenant as the enqueuer
    await mailer.send(ctx, { to: order.email, template: 'order-confirmation', data: order });
  },
});
```

The handler is `(ctx, data)`, the same shape as everywhere else. `ctx` carries the enqueuer's
`traceId`, `tenantId` and `userId`, plus `jobId`, `attemptNumber`, `maxAttempts`, `signal` and
`updateProgress()`. The generator adds the definition to `src/jobs/index.ts`, and `main.ts` registers
everything in that list.

Handlers that need services get them from a factory closed over the dependencies:

```ts
export const createSendOrderConfirmationJob = (deps: { orders: OrdersRepository; mailer: Mailer }) =>
  defineJob({ name: 'send-order-confirmation', schema, handler: async (ctx, data) => { /* deps.orders ... */ } });
```

## 2. Enqueue from a service

```ts
await this.jobs.enqueueWithDedup(ctx, 'send-order-confirmation', { orderId: order.id }, `order-confirmation:${order.id}`);
```

The payload is validated against the job's schema before it's enqueued, so a bad payload fails in the
request instead of in the worker. The dedup key makes a second enqueue for the same order a no-op while
the first job exists. Keys may contain `:` or any other character.

Enqueue **after** the data is committed. Inside `withTransaction`, a job can start before the commit
and not find the row. When the job must be tied to the transaction, publish an event through the
[outbox](../events.md#transactional-outbox) and enqueue from its subscriber.

## 3. Make the side effect idempotent

Retries and redeliveries mean the handler can run more than once for the same order (for example, if
the process dies after sending and before acknowledging). Guard the effect itself:

```ts
const outcome = await runOnce(idempotency, `order-confirmation:${data.orderId}`, () => mailer.send(ctx, message));
if (outcome.status !== 'processed') ctx.logger.info({ status: outcome.status }, 'confirmation already sent');
```

## 4. Schedule (optional)

```ts
jobs.schedule({ name: 'nightly-reconcile', cron: '0 3 * * *', timezone: 'UTC', jobName: 'reconcile-orders', data: {} });
```

Only processes that call `jobs.start()` should register schedules, and each must register all of them:
`start()` removes schedules it doesn't know. See [jobs.md](../jobs.md#schedules).

## 5. Operate

- Failures are retried with backoff. After the last attempt the job moves to the dead-letter queue:
  `jobs.listDeadLetters()`, then `jobs.retryDeadLetter(id)` once the cause is fixed.
- Override `onJobFailed(ctx, event)` in a `DefaultJobs` subclass and alert when `event.final` is true.
- Test the handler directly with a context and fakes, or run it end to end with
  `createJobQueue({ adapter: 'memory' }, logger)`.

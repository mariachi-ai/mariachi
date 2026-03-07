# Recipe: Add a Background Job

This walks through defining a new job, registering it in the worker, and enqueuing it from a service.

---

## 1. Define the Job

Jobs are plain objects with `name`, `schema` (Zod), `retry` config, and a `handler`.

**File:** e.g. `src/jobs/process-order.job.ts`

```ts
import { z } from 'zod';

export const ProcessOrderJob = {
  name: 'orders.process',
  schema: z.object({
    orderId: z.string(),
    userId: z.string(),
  }),
  retry: { attempts: 3, backoff: 'exponential' as const },
  handler: async (
    data: { orderId: string; userId: string },
    ctx: { logger: any; traceId: string; attemptNumber: number; jobId: string },
  ) => {
    ctx.logger.info({ orderId: data.orderId }, 'Processing order');
    // business logic here
  },
};
```

**Job handler signature:**
- `data` — validated payload (matches the Zod schema)
- `ctx` — job context with `logger`, `traceId`, `attemptNumber`, `jobId`

**Retry options:**
- `attempts` — max retries
- `backoff` — `'exponential'` or `'fixed'`

---

## 2. Register the Job in the Worker

Add the job to the worker entry point.

**File:** e.g. `src/worker/index.ts`

```ts
import { ProcessOrderJob } from './jobs/process-order.job';

jobQueue.registerJob(ProcessOrderJob);
```

---

## 3. Add a Schedule (Optional)

If the job should run on a cron schedule, add an entry to your schedules.

**File:** e.g. `src/jobs/schedules.ts`

```ts
export const schedules = [
  { name: 'daily-cleanup', cron: '0 0 * * *', jobName: 'system.cleanup', data: {} },
  { name: 'hourly-order-check', cron: '0 * * * *', jobName: 'orders.process', data: { orderId: 'batch', userId: 'system' } },
];
```

Register in the worker entry:

```ts
for (const schedule of schedules) {
  jobQueue.register(schedule);
}
```

---

## 4. Enqueue from a Service

To trigger a job from business logic, use `jobQueue.enqueue()`.

```ts
import { createJobQueue } from '@mariachi/jobs';

const jobQueue = createJobQueue({ adapter: 'bullmq', redisUrl: config.redis.url }, logger);

await jobQueue.enqueue('orders.process', { orderId: '123', userId: 'user-1' });
```

For deduplication (prevent duplicate jobs for the same entity):

```ts
await jobQueue.enqueueWithDedup('orders.process', { orderId: '123', userId: 'user-1' }, {
  dedupKey: 'orders.process:123',
});
```

---

## 5. Test the Job

Use `TestJobQueue` from `@mariachi/testing`:

```ts
import { describe, it, expect } from 'vitest';
import { TestJobQueue } from '@mariachi/testing';
import { ProcessOrderJob } from '../process-order.job';

describe('ProcessOrderJob', () => {
  it('processes an order', async () => {
    const queue = new TestJobQueue();
    queue.registerJob(ProcessOrderJob);
    await queue.enqueue('orders.process', { orderId: '123', userId: 'user-1' });
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0].name).toBe('orders.process');
  });
});
```

---

## Worker Lifecycle

The worker connects to Redis (BullMQ) on startup and gracefully stops on shutdown:

```ts
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
```

---

## Checklist

- [ ] Job defined with Zod schema and retry config
- [ ] Job registered via `jobQueue.registerJob()` in worker entry point
- [ ] Schedule added (if cron-based)
- [ ] Enqueue call added in the service that triggers the job
- [ ] Tests added using `TestJobQueue`

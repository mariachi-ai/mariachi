# Jobs

Background work on BullMQ (Redis), or in memory for tests. Use a job when work should leave the
request path, run later or on a schedule, or needs retries that survive a restart.

## Define and register

```ts
export const sendDigestJob = defineJob({
  name: 'send-digest',
  schema: z.object({ userId: z.string().uuid() }),
  retry: { attempts: 5, backoff: 'exponential', delay: 1_000 },
  timeoutMs: 60_000,
  nonRetryableCodes: ['users/not-found'],
  handler: async (ctx, data) => {
    // ctx: the enqueuer's traceId/tenantId/userId, plus jobId, attemptNumber, maxAttempts,
    // signal (aborted on timeout or shutdown) and updateProgress()
    await digests.send(ctx, data.userId);
  },
});

const jobs = new DefaultJobs({ queue: createJobQueue({ adapter: 'bullmq', redisUrl, prefix: 'app' }, logger) }, instrumentation);
jobs.registerJob(sendDigestJob);
lifecycle.manage('jobs', jobs);                        // connect/disconnect/health
lifecycle.startup.register({ name: 'jobs-worker', priority: 90, fn: () => jobs.start() }); // worker processes only
```

Generated projects list definitions in `src/jobs/index.ts` (`mariachi generate job <name>`).

## Enqueue

```ts
await jobs.enqueue(ctx, 'send-digest', { userId });                          // validated against the schema
await jobs.enqueue(ctx, 'send-digest', { userId }, { delay: 60_000, priority: 'high' });
await jobs.enqueueWithDedup(ctx, 'send-digest', { userId }, `digest:${userId}`); // no-op while one is pending
await jobs.cancel(ctx, jobId);                                               // waiting or delayed jobs only
```

The context is serialized into the job, so the handler logs with the same `traceId` and repositories
are scoped to the same tenant. Dedup keys may contain any characters (they're hashed into a BullMQ-safe
id). A key only dedups while the job still exists (waiting, delayed, or kept after completion); to
guarantee a side effect happens once, also wrap it with `runOnce`.

## Retries and the dead-letter queue

Attempts back off per `retry` (default 3 attempts, exponential from 1s). Errors whose `code` is in
`nonRetryableCodes` fail immediately. When attempts run out, the job moves to the dead-letter queue with
its data, context and last error (`deadLetter: true` by default).

```ts
const dead = await jobs.listDeadLetters(50);
await jobs.retryDeadLetter(dead[0].id);   // re-enqueues with the original context and removes the entry
```

## Hooks

Subclass `DefaultJobs` to observe outcomes. Hooks receive a context rebuilt from the job's envelope.

```ts
class AppJobs extends DefaultJobs {
  protected async onJobCompleted(ctx: Context, e: JobCompletedEvent) { /* e.durationMs, e.attempts */ }
  protected async onJobFailed(ctx: Context, e: JobFailureEvent) {
    if (e.final) await alerts.page(ctx, `${e.jobName} dead-lettered: ${e.error.message}`);
  }
}
```

Metrics: `jobs.enqueued`, `jobs.completed`, `jobs.retried`, `jobs.failed` (dead-lettered), `jobs.duration`.

## Schedules

```ts
jobs.schedule({ name: 'nightly-digest', cron: '0 6 * * *', timezone: 'Europe/Amsterdam', jobName: 'send-digest', data: {} });
await jobs.unschedule('nightly-digest');
```

Schedules are upserted when `start()` runs, and any schedule in Redis that this process didn't register
is removed. Removing a `schedule()` call from code therefore removes the schedule on the next deploy.
It also means every process that calls `start()` must register the full set of schedules; an API-only
process should not call `start()`.

## Shutdown

`disconnect()` stops taking new jobs and waits up to `shutdownTimeoutMs` (30s) for running ones to
finish. After that it aborts `ctx.signal` with `jobs/shutdown` and force-closes, and the interrupted
jobs are retried later. Handlers doing long work should check `ctx.signal`.

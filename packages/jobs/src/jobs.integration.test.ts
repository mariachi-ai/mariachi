import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { createContext, MariachiError, type Context, type Logger } from '@mariachi/core';
import { startRedis, stopAll } from '../../../test/setup';
import { BullMQAdapter, DefaultJobs, Jobs, defineJob, type JobCompletedEvent, type JobContext, type JobFailureEvent } from './index';

const logger: Logger = { info() {}, warn() {}, error() {}, debug() {}, child: () => logger };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await sleep(25);
  }
}

class HookedJobs extends Jobs {
  completed: Array<{ ctx: Context; e: JobCompletedEvent }> = [];
  failed: Array<{ ctx: Context; e: JobFailureEvent }> = [];
  protected override async onJobCompleted(ctx: Context, e: JobCompletedEvent) {
    this.completed.push({ ctx, e });
  }
  protected override async onJobFailed(ctx: Context, e: JobFailureEvent) {
    this.failed.push({ ctx, e });
  }
}

let redisUrl: string;
const running: Jobs[] = [];

function make(prefix: string) {
  const backend = new BullMQAdapter({ adapter: 'bullmq', redisUrl, prefix, defaultRetry: { attempts: 1, backoff: 'fixed', delay: 10 }, shutdownTimeoutMs: 2_000 }, logger);
  const jobs = new HookedJobs({ queue: backend }, { logger });
  running.push(jobs);
  return { backend, jobs };
}

beforeAll(async () => {
  redisUrl = await startRedis();
});

afterAll(async () => {
  await Promise.all(running.map((j) => j.disconnect().catch(() => undefined)));
  await stopAll();
});

describe('BullMQ jobs', () => {
  it('runs jobs with the enqueuing context and fires completion hooks', async () => {
    const { jobs } = make('it-ctx');
    const seen: Array<{ ctx: JobContext; data: { to: string } }> = [];
    jobs.registerJob(defineJob({ name: 'email', schema: z.object({ to: z.string() }), handler: async (ctx, data) => void seen.push({ ctx, data }) }));
    await jobs.start();
    const ctx = createContext({ logger, traceId: 'trace-bull', tenantId: 't1', userId: 'u1', identityType: 'user' });
    await jobs.enqueue(ctx, 'email', { to: 'a@b.co' });
    await waitFor(() => seen.length === 1 && jobs.completed.length === 1);
    expect(seen[0]!.ctx).toMatchObject({ traceId: 'trace-bull', tenantId: 't1', userId: 'u1', attemptNumber: 1 });
    expect(seen[0]!.data).toEqual({ to: 'a@b.co' });
    expect(jobs.completed[0]!.ctx).toMatchObject({ traceId: 'trace-bull', tenantId: 't1' });
    expect(jobs.completed[0]!.e).toMatchObject({ jobName: 'email', attempts: 1 });
  });

  it('retries with backoff, then dead-letters with the error code, and can replay', async () => {
    const { jobs } = make('it-retry');
    let attempts = 0;
    let heal = false;
    jobs.registerJob(
      defineJob({
        name: 'flaky',
        schema: z.object({ n: z.number() }),
        retry: { attempts: 3, backoff: 'fixed', delay: 20 },
        handler: async () => {
          attempts++;
          if (!heal) throw new MariachiError('upstream/down', 'nope');
        },
      }),
    );
    await jobs.start();
    await jobs.enqueue(createContext({ logger, tenantId: 't9' }), 'flaky', { n: 1 });
    await waitFor(async () => (await jobs.listDeadLetters()).length === 1);
    expect(attempts).toBe(3);
    const [dead] = await jobs.listDeadLetters();
    expect(dead).toMatchObject({ jobName: 'flaky', attempts: 3, data: { n: 1 }, error: { code: 'upstream/down' }, context: { tenantId: 't9' } });
    expect(jobs.failed.filter((f) => f.e.final)).toHaveLength(1);
    expect(jobs.failed.filter((f) => !f.e.final)).toHaveLength(2);

    heal = true;
    await jobs.retryDeadLetter(dead!.id);
    await waitFor(() => jobs.completed.some((c) => c.e.jobName === 'flaky'));
    expect(await jobs.listDeadLetters()).toHaveLength(0);
    expect(jobs.completed.find((c) => c.e.jobName === 'flaky')!.ctx.tenantId).toBe('t9');
  });

  it('skips retries for non-retryable codes and keeps the code', async () => {
    const { jobs } = make('it-nonretry');
    let attempts = 0;
    jobs.registerJob(
      defineJob({
        name: 'charge',
        schema: z.object({}),
        retry: { attempts: 5, backoff: 'fixed', delay: 10 },
        nonRetryableCodes: ['billing/card-declined'],
        handler: async () => {
          attempts++;
          throw new MariachiError('billing/card-declined', 'declined');
        },
      }),
    );
    await jobs.start();
    await jobs.enqueue(createContext({ logger }), 'charge', {});
    await waitFor(async () => (await jobs.listDeadLetters()).length === 1);
    expect(attempts).toBe(1);
    expect((await jobs.listDeadLetters())[0]!.error.code).toBe('billing/card-declined');
  });

  it('deduplicates by dedupKey', async () => {
    const { jobs } = make('it-dedup');
    let runs = 0;
    jobs.registerJob(defineJob({ name: 'once', schema: z.object({}), handler: async () => void runs++ }));
    const ctx = createContext({ logger });
    const a = await jobs.enqueue(ctx, 'once', {}, { dedupKey: 'order:42', delay: 200 });
    const b = await jobs.enqueue(ctx, 'once', {}, { dedupKey: 'order:42' });
    const c = await jobs.enqueue(ctx, 'once', {}, { dedupKey: '42', delay: 200 });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(await jobs.cancel(ctx, c)).toBe(true);
    await jobs.start();
    await waitFor(() => runs === 1);
    await sleep(300);
    expect(runs).toBe(1);
  });

  it('upserts schedules, prunes stale ones on start, and unschedules', async () => {
    const prefix = 'it-sched';
    const queueName = `${prefix}-jobs`;
    const u = new URL(redisUrl);
    const inspect = new Queue(queueName, { connection: { host: u.hostname, port: Number(u.port || 6379), maxRetriesPerRequest: null }, prefix });
    try {
      const first = make(prefix);
      first.jobs.registerJob(defineJob({ name: 'report', schema: z.object({}), handler: async () => {} }));
      first.jobs.schedule({ name: 'nightly', cron: '0 3 * * *', jobName: 'report' });
      first.jobs.schedule({ name: 'hourly', cron: '0 * * * *', jobName: 'report' });
      await first.jobs.start();
      const keys = async () => (await inspect.getJobSchedulers()).map((s) => s.key ?? s.id).sort();
      expect(await keys()).toEqual(['hourly', 'nightly']);
      await first.jobs.disconnect();

      const second = make(prefix);
      second.jobs.registerJob(defineJob({ name: 'report', schema: z.object({}), handler: async () => {} }));
      second.jobs.schedule({ name: 'nightly', cron: '0 4 * * *', jobName: 'report' });
      await second.jobs.start();
      expect(await keys()).toEqual(['nightly']);

      await second.jobs.unschedule('nightly');
      expect(await keys()).toEqual([]);
    } finally {
      await inspect.close();
    }
  });
});

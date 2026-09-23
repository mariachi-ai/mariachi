import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createContext, MariachiError } from '@mariachi/core';
import { DefaultJobs, MemoryJobAdapter, defineJob, type JobContext } from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };
const deps = { logger: silent };

function setup() {
  const backend = new MemoryJobAdapter({ defaultRetry: { attempts: 3, backoff: 'fixed', delay: 1 } }, silent);
  const jobs = new DefaultJobs({ queue: backend }, deps);
  return { backend, jobs };
}

describe('jobs', () => {
  it('carries tenant/trace context from enqueue into the worker', async () => {
    const { backend, jobs } = setup();
    const seen: JobContext[] = [];
    jobs.registerJob(defineJob({ name: 'email.send', schema: z.object({ to: z.string() }), handler: async (ctx) => void seen.push(ctx) }));
    await jobs.start();
    const ctx = createContext({ logger: silent, tenantId: 't1', userId: 'u1', traceId: 'trace-1' });
    await jobs.enqueue(ctx, 'email.send', { to: 'a@b.co' });
    await backend.drain();
    expect(seen[0]).toMatchObject({ tenantId: 't1', userId: 'u1', traceId: 'trace-1', attemptNumber: 1 });
  });

  it('rejects invalid payloads at enqueue time', async () => {
    const { jobs } = setup();
    jobs.registerJob(defineJob({ name: 'x', schema: z.object({ n: z.number() }), handler: async () => {} }));
    await expect(jobs.enqueue(createContext({ logger: silent }), 'x', { n: 'nope' })).rejects.toMatchObject({ code: 'validation/invalid-input' });
  });

  it('retries with the configured attempts then dead-letters', async () => {
    const { backend, jobs } = setup();
    let attempts = 0;
    jobs.registerJob(
      defineJob({
        name: 'flaky',
        schema: z.object({}),
        retry: { attempts: 2, backoff: 'fixed', delay: 1 },
        handler: async () => {
          attempts++;
          throw new MariachiError('upstream/down', 'nope');
        },
      }),
    );
    await jobs.start();
    await jobs.enqueue(createContext({ logger: silent }), 'flaky', {});
    await backend.drain();
    expect(attempts).toBe(2);
    const dead = await jobs.listDeadLetters();
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ jobName: 'flaky', attempts: 2, error: { code: 'upstream/down' } });
  });

  it('does not retry non-retryable error codes', async () => {
    const { backend, jobs } = setup();
    let attempts = 0;
    jobs.registerJob(
      defineJob({
        name: 'strict',
        schema: z.object({}),
        nonRetryableCodes: ['billing/card-declined'],
        handler: async () => {
          attempts++;
          throw new MariachiError('billing/card-declined', 'declined');
        },
      }),
    );
    await jobs.start();
    await jobs.enqueue(createContext({ logger: silent }), 'strict', {});
    await backend.drain();
    expect(attempts).toBe(1);
  });

  it('deduplicates by dedupKey while the job is pending', async () => {
    const { backend, jobs } = setup();
    let runs = 0;
    jobs.registerJob(defineJob({ name: 'once', schema: z.object({}), handler: async () => void runs++ }));
    const ctx = createContext({ logger: silent });
    const a = await jobs.enqueue(ctx, 'once', {}, { dedupKey: 'k1' });
    const b = await jobs.enqueue(ctx, 'once', {}, { dedupKey: 'k1' });
    expect(a).toBe(b);
    await jobs.start();
    await backend.drain();
    expect(runs).toBe(1);
  });
});

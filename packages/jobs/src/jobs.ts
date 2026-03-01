import type { Context, Logger, Instrumentable } from '@mariachi/core';
import { withSpan, getContainer, KEYS, JobsError } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/core';
import type { JobQueue, JobWorker, JobDefinition, JobPriority } from './types';
import { JOB_PRIORITY_VALUES } from './types';

export abstract class Jobs implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly queue: JobQueue & JobWorker;

  constructor(config: { queue: JobQueue & JobWorker }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.queue = config.queue;
  }

  async enqueue<T>(
    ctx: Context,
    jobName: string,
    data: T,
    options?: { delay?: number; priority?: number; traceId?: string },
  ): Promise<string> {
    return withSpan(this.tracer, 'jobs.enqueue', { job: jobName, traceId: ctx.traceId }, async () => {
      this.logger.info({ traceId: ctx.traceId, job: jobName }, 'Enqueuing job');
      const id = await this.queue.enqueue(jobName, data, options);
      this.metrics?.increment('jobs.enqueued', 1, { job: jobName });
      await this.onJobEnqueued?.(ctx, jobName, id);
      return id;
    });
  }

  registerJob<T>(definition: JobDefinition<T>): void {
    this.queue.registerJob(definition);
  }

  async start(): Promise<void> { await this.queue.start(); }
  async stop(): Promise<void> { await this.queue.stop(); }
  async connect(): Promise<void> { await this.queue.connect(); }
  async disconnect(): Promise<void> { await this.queue.disconnect(); }

  async enqueueWithDedup<T>(ctx: Context, jobName: string, data: T, dedupKey: string, options?: { priority?: JobPriority }): Promise<string | null> {
    return withSpan(this.tracer, 'jobs.enqueueWithDedup', { jobName, dedupKey }, async () => {
      this.logger.info({ traceId: ctx.traceId, jobName, dedupKey }, 'Enqueueing job with dedup');
      const priority = options?.priority ? JOB_PRIORITY_VALUES[options.priority] : undefined;
      const jobId = await this.enqueue(ctx, jobName, data, { priority });
      return jobId;
    });
  }

  protected onJobEnqueued?(ctx: Context, jobName: string, jobId: string): Promise<void>;
  protected onJobCompleted?(ctx: Context, jobName: string, jobId: string): Promise<void>;
  protected onJobFailed?(ctx: Context, jobName: string, jobId: string, error: unknown): Promise<void>;
}

export class DefaultJobs extends Jobs {}

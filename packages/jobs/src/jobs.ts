import type { Context, Logger, Instrumentable, Disposable } from '@mariachi/core';
import { createContext, withSpan, fromZodError, resolveInstrumentation, type InstrumentationDeps } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/core';
import type { JobCompletedEvent, JobContextEnvelope, JobDefinition, JobFailureEvent, JobPriority, ScheduleDefinition } from './types';
import type { JobBackend } from './queue';
import { toEnvelope } from './envelope';

export interface JobsEnqueueOptions {
  delay?: number;
  priority?: number | JobPriority;
  /** Deduplication key; enqueuing the same key again while the job exists is a no-op. */
  dedupKey?: string;
}

/**
 * Jobs service: validates payloads against the registered schema before enqueueing, and carries
 * `ctx` (trace, tenant, user) into the worker's `JobContext`.
 */
export abstract class Jobs implements Instrumentable, Disposable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly queue: JobBackend;
  private readonly definitions = new Map<string, JobDefinition>();

  constructor(config: { queue: JobBackend }, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.queue = config.queue;
    this.queue.onFailed((e) => {
      this.metrics?.increment(e.final ? 'jobs.failed' : 'jobs.retried', 1, { job: e.jobName });
      if (this.onJobFailed) {
        this.onJobFailed(this.hookContext(e.context, e.jobId), e).catch((err: unknown) =>
          this.logger.error({ jobId: e.jobId, error: (err as Error).message }, 'onJobFailed hook threw'),
        );
      }
    });
    this.queue.onCompleted((e) => {
      this.metrics?.increment('jobs.completed', 1, { job: e.jobName });
      this.metrics?.timing('jobs.duration', e.durationMs, { job: e.jobName });
      if (this.onJobCompleted) {
        this.onJobCompleted(this.hookContext(e.context, e.jobId), e).catch((err: unknown) =>
          this.logger.error({ jobId: e.jobId, error: (err as Error).message }, 'onJobCompleted hook threw'),
        );
      }
    });
  }

  private hookContext(envelope: JobContextEnvelope | undefined, jobId: string): Context {
    return createContext({
      traceId: envelope?.traceId,
      tenantId: envelope?.tenantId ?? null,
      userId: envelope?.userId ?? null,
      scopes: envelope?.scopes ?? [],
      identityType: envelope?.identityType ?? 'system',
      logger: this.logger.child({ jobId, traceId: envelope?.traceId }),
    });
  }

  async enqueue<T>(ctx: Context, jobName: string, data: T, options: JobsEnqueueOptions = {}): Promise<string> {
    return withSpan(this.tracer, 'jobs.enqueue', { job: jobName }, async () => {
      const definition = this.definitions.get(jobName);
      if (definition) {
        const parsed = definition.schema.safeParse(data);
        if (!parsed.success) throw fromZodError(parsed.error);
      }
      const id = await this.queue.enqueue(jobName, data, {
        delay: options.delay,
        priority: options.priority,
        jobId: options.dedupKey,
        context: toEnvelope(ctx),
      });
      this.metrics?.increment('jobs.enqueued', 1, { job: jobName });
      ctx.logger.debug({ job: jobName, jobId: id }, 'job enqueued');
      await this.onJobEnqueued?.(ctx, jobName, id);
      return id;
    });
  }

  /** @deprecated use enqueue(ctx, name, data, { dedupKey }) */
  async enqueueWithDedup<T>(ctx: Context, jobName: string, data: T, dedupKey: string, options?: { priority?: JobPriority }): Promise<string> {
    return this.enqueue(ctx, jobName, data, { dedupKey, priority: options?.priority });
  }

  cancel(_ctx: Context, jobId: string): Promise<boolean> {
    return this.queue.cancel(jobId);
  }

  registerJob<T>(definition: JobDefinition<T>): void {
    this.definitions.set(definition.name, definition as JobDefinition);
    this.queue.registerJob(definition);
  }

  schedule(schedule: ScheduleDefinition): void {
    this.queue.register(schedule);
  }

  /** Removes a cron schedule (locally and in the backend). */
  unschedule(name: string): Promise<void> {
    return this.queue.unregister(name);
  }

  listDeadLetters(limit?: number) {
    return this.queue.listDeadLetters(limit);
  }

  retryDeadLetter(id: string) {
    return this.queue.retryDeadLetter(id);
  }

  async start(): Promise<void> { await this.queue.start(); }
  async stop(): Promise<void> { await this.queue.stop(); }
  async connect(): Promise<void> { await this.queue.connect(); }
  async disconnect(): Promise<void> { await this.queue.disconnect(); }
  isHealthy(): Promise<boolean> { return this.queue.isHealthy(); }

  protected onJobEnqueued?(ctx: Context, jobName: string, jobId: string): Promise<void>;
  /** Runs after a job succeeds, with the job's original context. */
  protected onJobCompleted?(ctx: Context, event: JobCompletedEvent): Promise<void>;
  /** Runs after every failed attempt; `event.final` means it was dead-lettered. */
  protected onJobFailed?(ctx: Context, event: JobFailureEvent): Promise<void>;
}

export class DefaultJobs extends Jobs {}

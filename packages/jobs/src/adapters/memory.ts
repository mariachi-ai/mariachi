import { randomUUID } from 'node:crypto';
import { JobsError, type Logger } from '@mariachi/core';
import type {
  DeadLetterEntry,
  EnqueueOptions,
  JobCompletedListener,
  JobConfig,
  JobDefinition,
  JobFailureListener,
  JobQueue,
  JobScheduler,
  JobWorker,
  ScheduleDefinition,
} from '../types';
import { DEFAULT_RETRY, buildJobContext, isNonRetryable, retryDelay, runWithTimeout, unwrap, wrap } from '../envelope';

interface PendingJob {
  id: string;
  name: string;
  data: ReturnType<typeof wrap>;
  attemptsMade: number;
  timer?: NodeJS.Timeout;
}

/**
 * In-process queue with the same semantics as BullMQ (retry/backoff, dedup, DLQ). For local
 * development and tests; jobs are lost on restart. Cron schedules are not executed.
 */
export class MemoryJobAdapter implements JobQueue, JobWorker, JobScheduler {
  private readonly definitions = new Map<string, JobDefinition>();
  private readonly pending = new Map<string, PendingJob>();
  private readonly dead = new Map<string, DeadLetterEntry>();
  private readonly listeners: JobFailureListener[] = [];
  private readonly completedListeners: JobCompletedListener[] = [];
  private readonly schedules = new Map<string, ScheduleDefinition>();
  private running = false;
  private readonly inflight = new Set<Promise<void>>();
  private readonly abort = new AbortController();

  constructor(
    private readonly config: Partial<JobConfig>,
    private readonly logger: Logger,
  ) {}

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {
    await this.stop();
  }
  async isHealthy(): Promise<boolean> {
    return true;
  }

  async enqueue<T>(jobName: string, data: T, options: EnqueueOptions = {}): Promise<string> {
    const id = options.jobId ?? randomUUID();
    if (this.pending.has(id)) return id;
    const job: PendingJob = { id, name: jobName, data: wrap(data, options), attemptsMade: 0 };
    this.pending.set(id, job);
    this.schedule(job, options.delay ?? 0);
    return id;
  }

  async cancel(jobId: string): Promise<boolean> {
    const job = this.pending.get(jobId);
    if (!job || !job.timer) return false;
    clearTimeout(job.timer);
    this.pending.delete(jobId);
    return true;
  }

  async listDeadLetters(limit = 100): Promise<DeadLetterEntry[]> {
    return [...this.dead.values()].slice(0, limit);
  }

  async retryDeadLetter(id: string): Promise<string> {
    const entry = this.dead.get(id);
    if (!entry) throw new JobsError('jobs/dead-letter-not-found', `Dead letter ${id} not found`);
    this.dead.delete(id);
    return this.enqueue(entry.jobName, entry.data, { context: entry.context });
  }

  registerJob<T>(definition: JobDefinition<T>): void {
    if (this.definitions.has(definition.name)) {
      throw new JobsError('jobs/duplicate-definition', `Job ${definition.name} is already registered`);
    }
    this.definitions.set(definition.name, definition as JobDefinition);
  }

  onFailed(listener: JobFailureListener): void {
    this.listeners.push(listener);
  }

  onCompleted(listener: JobCompletedListener): void {
    this.completedListeners.push(listener);
  }

  register(schedule: ScheduleDefinition): void {
    this.schedules.set(schedule.name, schedule);
  }

  async unregister(name: string): Promise<void> {
    this.schedules.delete(name);
  }

  async start(): Promise<void> {
    this.running = true;
    for (const job of this.pending.values()) if (!job.timer) this.schedule(job, 0);
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const job of this.pending.values()) if (job.timer) clearTimeout(job.timer);
    await Promise.allSettled([...this.inflight]);
  }

  /** Resolves when no jobs are pending or running. Test helper. */
  async drain(): Promise<void> {
    while (this.pending.size > 0 || this.inflight.size > 0) {
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  private schedule(job: PendingJob, delay: number) {
    if (!this.running) {
      job.timer = undefined;
      return;
    }
    job.timer = setTimeout(() => {
      job.timer = undefined;
      const p = this.run(job).finally(() => this.inflight.delete(p));
      this.inflight.add(p);
    }, delay);
    job.timer.unref?.();
  }

  private async run(job: PendingJob): Promise<void> {
    const definition = this.definitions.get(job.name);
    const retry = definition?.retry ?? this.config.defaultRetry ?? DEFAULT_RETRY;
    const { payload, context } = unwrap(job.data);
    job.attemptsMade++;
    const startedAt = Date.now();
    try {
      if (!definition) throw new JobsError('jobs/unknown-job', `No handler registered for job ${job.name}`);
      const parsed = definition.schema.safeParse(payload);
      if (!parsed.success) throw new JobsError('jobs/invalid-payload', parsed.error.message);
      await runWithTimeout(
        (signal) =>
          definition.handler(
            buildJobContext({
              logger: this.logger,
              envelope: context,
              jobId: job.id,
              jobName: job.name,
              attemptNumber: job.attemptsMade,
              maxAttempts: retry.attempts,
              signal,
              updateProgress: async () => {},
            }),
            parsed.data,
          ),
        definition.timeoutMs,
        this.abort.signal,
      );
      this.pending.delete(job.id);
      for (const l of this.completedListeners) {
        l({ jobId: job.id, jobName: job.name, attempts: job.attemptsMade, durationMs: Date.now() - startedAt, context });
      }
    } catch (error) {
      const final = !definition || isNonRetryable(definition, error) || (error as { code?: string }).code === 'jobs/unknown-job' || job.attemptsMade >= retry.attempts;
      for (const l of this.listeners) l({ jobId: job.id, jobName: job.name, error: error as Error, attempts: job.attemptsMade, final, context });
      if (final) {
        this.pending.delete(job.id);
        if (this.config.deadLetter !== false) {
          this.dead.set(job.id, {
            id: job.id,
            jobName: job.name,
            data: payload,
            context,
            error: { message: (error as Error).message, code: (error as { code?: string }).code },
            attempts: job.attemptsMade,
            failedAt: new Date().toISOString(),
          });
        }
        this.logger.error({ jobId: job.id, jobName: job.name, err: error }, 'job failed permanently');
      } else {
        this.schedule(job, retryDelay(retry, job.attemptsMade));
      }
    }
  }
}

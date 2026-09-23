import { createHash } from 'node:crypto';
import { Queue, Worker, UnrecoverableError, type Job, type MinimalJob, type ConnectionOptions } from 'bullmq';
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
import { DEFAULT_RETRY, buildJobContext, isNonRetryable, priorityValue, retryDelay, runWithTimeout, unwrap, wrap } from '../envelope';

/** BullMQ rejects custom ids containing `:` or made only of digits; hash those deterministically. */
export function toBullJobId(key: string | undefined): string | undefined {
  if (key === undefined) return undefined;
  if (!key.includes(':') && !/^\d+$/.test(key)) return key;
  return `k_${createHash('sha256').update(key).digest('base64url').slice(0, 32)}`;
}

/** An UnrecoverableError that keeps the original `code` for listeners and the DLQ. */
function unrecoverable(code: string | undefined, message: string): UnrecoverableError {
  return Object.assign(new UnrecoverableError(message), { code });
}

function connectionFromUrl(url: string | undefined): ConnectionOptions {
  if (!url) return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new JobsError('jobs/invalid-redis-url', 'Invalid redisUrl');
  }
  const db = parsed.pathname && parsed.pathname !== '/' ? Number.parseInt(parsed.pathname.slice(1), 10) : undefined;
  return {
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isFinite(db) ? db : undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * BullMQ-backed queue, worker and scheduler. Applies per-job retry/backoff, carries the request
 * context inside job data, deduplicates by `jobId`, dead-letters exhausted jobs and prunes
 * schedules that are no longer registered.
 */
export class BullMQAdapter implements JobQueue, JobWorker, JobScheduler {
  private queue: Queue | null = null;
  private dlq: Queue | null = null;
  private worker: Worker | null = null;
  private readonly definitions = new Map<string, JobDefinition>();
  private readonly schedules = new Map<string, ScheduleDefinition>();
  private readonly failureListeners: JobFailureListener[] = [];
  private readonly completedListeners: JobCompletedListener[] = [];
  private readonly active = new Map<string, AbortController>();
  private readonly connection: ConnectionOptions;

  constructor(
    private readonly config: JobConfig,
    private readonly logger: Logger,
  ) {
    this.connection = connectionFromUrl(config.redisUrl);
  }

  private get prefix() {
    return this.config.prefix ?? 'mariachi';
  }

  private get queueName() {
    return this.config.queue ?? `${this.prefix}-jobs`;
  }

  private requireQueue(): Queue {
    if (!this.queue) throw new JobsError('jobs/not-connected', 'Job queue is not connected');
    return this.queue;
  }

  async connect(): Promise<void> {
    if (this.queue) return;
    this.queue = new Queue(this.queueName, { connection: this.connection, prefix: this.prefix });
    this.queue.on('error', (err) => this.logger.error({ err }, 'job queue error'));
    if (this.config.deadLetter !== false) {
      this.dlq = new Queue(`${this.queueName}-dead`, { connection: this.connection, prefix: this.prefix });
    }
    await this.queue.waitUntilReady();
  }

  async disconnect(): Promise<void> {
    await this.stop();
    await this.queue?.close();
    await this.dlq?.close();
    this.queue = null;
    this.dlq = null;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.requireQueue().client;
      return (await client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async enqueue<T>(jobName: string, data: T, options: EnqueueOptions = {}): Promise<string> {
    await this.connect();
    const retry = this.definitions.get(jobName)?.retry ?? this.config.defaultRetry ?? DEFAULT_RETRY;
    try {
      const job = await this.requireQueue().add(jobName, wrap(data, options), {
        jobId: toBullJobId(options.jobId),
        delay: options.delay,
        priority: priorityValue(options.priority),
        attempts: Math.max(1, retry.attempts),
        backoff: { type: 'mariachi' },
        removeOnComplete: { count: this.config.keepCompleted ?? 1000 },
        removeOnFail: { count: this.config.keepFailed ?? 5000 },
      });
      return job.id ?? '';
    } catch (cause) {
      throw new JobsError('jobs/enqueue-failed', `Failed to enqueue ${jobName}`, { cause });
    }
  }

  async cancel(jobId: string): Promise<boolean> {
    const job = await this.requireQueue().getJob(jobId);
    if (!job) return false;
    const state = await job.getState();
    if (state !== 'waiting' && state !== 'delayed' && state !== 'prioritized') return false;
    await job.remove();
    return true;
  }

  async listDeadLetters(limit = 100): Promise<DeadLetterEntry[]> {
    if (!this.dlq) return [];
    const jobs = await this.dlq.getJobs(['waiting', 'delayed', 'paused'], 0, limit - 1);
    return jobs.map((j) => ({ id: j.id ?? '', ...(j.data as Omit<DeadLetterEntry, 'id'>) }));
  }

  async retryDeadLetter(id: string): Promise<string> {
    if (!this.dlq) throw new JobsError('jobs/no-dlq', 'Dead-letter queue is disabled');
    const job = await this.dlq.getJob(id);
    if (!job) throw new JobsError('jobs/dead-letter-not-found', `Dead letter ${id} not found`);
    const entry = job.data as Omit<DeadLetterEntry, 'id'>;
    const newId = await this.enqueue(entry.jobName, entry.data, { context: entry.context });
    await job.remove();
    return newId;
  }

  registerJob<T>(definition: JobDefinition<T>): void {
    if (this.definitions.has(definition.name)) {
      throw new JobsError('jobs/duplicate-definition', `Job ${definition.name} is already registered`);
    }
    this.definitions.set(definition.name, definition as JobDefinition);
  }

  onFailed(listener: JobFailureListener): void {
    this.failureListeners.push(listener);
  }

  onCompleted(listener: JobCompletedListener): void {
    this.completedListeners.push(listener);
  }

  register(schedule: ScheduleDefinition): void {
    this.schedules.set(schedule.name, schedule);
  }

  async unregister(name: string): Promise<void> {
    this.schedules.delete(name);
    await this.queue?.removeJobScheduler(name);
  }

  private async process(job: Job): Promise<void> {
    const definition = this.definitions.get(job.name);
    if (!definition) throw unrecoverable('jobs/unknown-job', `No handler registered for job ${job.name}`);
    const { payload, context } = unwrap(job.data);
    const parsed = definition.schema.safeParse(payload);
    if (!parsed.success) throw unrecoverable('jobs/invalid-payload', `Invalid payload for ${job.name}: ${parsed.error.message}`);

    const controller = new AbortController();
    const id = job.id ?? '';
    this.active.set(id, controller);
    const startedAt = Date.now();
    try {
      await runWithTimeout(
        async (signal) => {
          const ctx = buildJobContext({
            logger: this.logger,
            envelope: context,
            jobId: id,
            jobName: job.name,
            attemptNumber: job.attemptsMade + 1,
            maxAttempts: job.opts.attempts ?? 1,
            signal,
            updateProgress: (p) => job.updateProgress(p),
          });
          await definition.handler(ctx, parsed.data);
        },
        definition.timeoutMs,
        controller.signal,
      );
      for (const l of this.completedListeners) {
        try {
          l({ jobId: id, jobName: job.name, attempts: job.attemptsMade + 1, durationMs: Date.now() - startedAt, context });
        } catch {}
      }
    } catch (error) {
      if (isNonRetryable(definition, error)) throw unrecoverable((error as { code?: string }).code, (error as Error).message);
      throw error;
    } finally {
      this.active.delete(id);
    }
  }

  private async handleFailure(job: Job | undefined, error: Error): Promise<void> {
    if (!job) return;
    const final = error instanceof UnrecoverableError || error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1);
    const { context: envelope } = unwrap(job.data);
    for (const l of this.failureListeners) {
      try {
        l({ jobId: job.id ?? '', jobName: job.name, error, attempts: job.attemptsMade, final, context: envelope });
      } catch {}
    }
    this.logger[final ? 'error' : 'warn']({ jobId: job.id, jobName: job.name, attempts: job.attemptsMade, err: error }, final ? 'job failed permanently' : 'job attempt failed');
    if (final && this.dlq) {
      const { payload, context } = unwrap(job.data);
      const entry: Omit<DeadLetterEntry, 'id'> = {
        jobName: job.name,
        data: payload,
        context,
        error: { message: error.message, code: (error as { code?: string }).code },
        attempts: job.attemptsMade,
        failedAt: new Date().toISOString(),
      };
      await this.dlq.add(job.name, entry, { jobId: job.id ? `dead-${job.id}` : undefined }).catch((err) => {
        this.logger.error({ err, jobId: job.id }, 'failed to dead-letter job');
      });
    }
  }

  async start(): Promise<void> {
    if (this.worker) return;
    await this.connect();
    const queue = this.requireQueue();

    for (const s of this.schedules.values()) {
      await queue.upsertJobScheduler(s.name, { pattern: s.cron, tz: s.timezone }, { name: s.jobName, data: wrap(s.data ?? {}) });
    }
    const existing = await queue.getJobSchedulers();
    for (const s of existing) {
      const key = s.key ?? s.id;
      if (key && !this.schedules.has(key)) {
        await queue.removeJobScheduler(key);
        this.logger.info({ schedule: key }, 'removed stale job schedule');
      }
    }

    if (this.definitions.size === 0) return;
    this.worker = new Worker(this.queueName, (job) => this.process(job), {
      connection: this.connection,
      prefix: this.prefix,
      concurrency: this.config.concurrency ?? 5,
      settings: {
        backoffStrategy: (attemptsMade: number, _type?: string, _err?: Error, job?: MinimalJob) => {
          const retry = (job && this.definitions.get(job.name)?.retry) ?? this.config.defaultRetry ?? DEFAULT_RETRY;
          return retryDelay(retry, attemptsMade);
        },
      },
    });
    this.worker.on('failed', (job, err) => void this.handleFailure(job, err));
    this.worker.on('error', (err) => this.logger.error({ err }, 'job worker error'));
    // Closing a worker whose connections are still opening leaks a "Connection is closed" rejection.
    await this.worker.waitUntilReady();
  }

  async stop(): Promise<void> {
    const worker = this.worker;
    if (!worker) return;
    this.worker = null;
    const timeout = this.config.shutdownTimeoutMs ?? 30_000;
    let timer: NodeJS.Timeout | undefined;
    const graceful = worker.close();
    const timedOut = await Promise.race([
      graceful.then(() => false),
      new Promise<boolean>((r) => {
        timer = setTimeout(() => r(true), timeout);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (timedOut) {
      this.logger.warn({ active: this.active.size }, 'job worker shutdown timed out; aborting active jobs');
      for (const c of this.active.values()) c.abort(new JobsError('jobs/shutdown', 'Worker shutting down'));
      await worker.close(true);
    }
  }
}

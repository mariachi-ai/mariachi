import type { z } from 'zod';
import type { Context } from '@mariachi/core';

export interface JobConfig {
  adapter: 'bullmq' | 'memory' | (string & {});
  redisUrl?: string;
  prefix?: string;
  /** Queue name. Default `<prefix>-jobs`. */
  queue?: string;
  concurrency?: number;
  /** Applied to jobs whose definition has no `retry`. Default 3 attempts, exponential from 1s. */
  defaultRetry?: RetryConfig;
  /** Keep this many completed jobs for inspection. Default 1000. */
  keepCompleted?: number;
  /** Keep this many failed jobs. Default 5000. */
  keepFailed?: number;
  /** Move jobs that exhaust retries to a dead-letter queue. Default true. */
  deadLetter?: boolean;
  /** How long `stop()` waits for active jobs. Default 30s. */
  shutdownTimeoutMs?: number;
}

export interface RetryConfig {
  attempts: number;
  backoff: 'exponential' | 'linear' | 'fixed';
  /** Base delay in ms. Default 1000. */
  delay?: number;
}

/** Serializable subset of `Context` carried inside job data so workers keep tenant/trace. */
export interface JobContextEnvelope {
  traceId: string;
  tenantId: string | null;
  userId: string | null;
  scopes: string[];
  identityType: string;
}

export interface JobContext extends Context {
  jobId: string;
  jobName: string;
  attemptNumber: number;
  maxAttempts: number;
  /** Aborted when the worker is shutting down or the job times out. */
  signal: AbortSignal;
  updateProgress(progress: number | Record<string, unknown>): Promise<void>;
}

export interface JobDefinition<T = unknown> {
  name: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  retry?: RetryConfig;
  /** Fail the attempt if the handler runs longer than this. */
  timeoutMs?: number;
  /** Errors whose `code` is listed here are not retried. */
  nonRetryableCodes?: string[];
  handler: (ctx: JobContext, data: T) => Promise<void>;
}

export interface ScheduleDefinition {
  /** Stable id; re-registering the same name updates the schedule. */
  name: string;
  cron: string;
  jobName: string;
  data?: unknown;
  timezone?: string;
}

export type JobPriority = 'critical' | 'high' | 'normal' | 'low';

export const JOB_PRIORITY_VALUES: Record<JobPriority, number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
};

export interface EnqueueOptions {
  delay?: number;
  priority?: number | JobPriority;
  /** Deduplication key: a second enqueue with the same id is ignored while the first exists. */
  jobId?: string;
  context?: JobContextEnvelope;
  /** @deprecated pass `context` */
  traceId?: string;
}

export interface DeadLetterEntry {
  id: string;
  jobName: string;
  data: unknown;
  context?: JobContextEnvelope;
  error: { message: string; code?: string };
  attempts: number;
  failedAt: string;
}

export interface JobQueue {
  enqueue<T>(jobName: string, data: T, options?: EnqueueOptions): Promise<string>;
  /** Removes a waiting/delayed job. Returns false if it was already running or gone. */
  cancel(jobId: string): Promise<boolean>;
  listDeadLetters(limit?: number): Promise<DeadLetterEntry[]>;
  /** Re-enqueues a dead-lettered job and removes it from the DLQ. */
  retryDeadLetter(id: string): Promise<string>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export interface JobFailureEvent {
  jobId: string;
  jobName: string;
  error: Error;
  attempts: number;
  /** True when no more retries will happen (the job is dead-lettered). */
  final: boolean;
  context?: JobContextEnvelope;
}

export interface JobCompletedEvent {
  jobId: string;
  jobName: string;
  attempts: number;
  durationMs: number;
  context?: JobContextEnvelope;
}

export type JobFailureListener = (event: JobFailureEvent) => void;
export type JobCompletedListener = (event: JobCompletedEvent) => void;

export interface JobWorker {
  registerJob<T>(definition: JobDefinition<T>): void;
  onFailed(listener: JobFailureListener): void;
  onCompleted(listener: JobCompletedListener): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface JobScheduler {
  /** Registers a cron schedule. On `start()`, schedules not registered in this process are removed. */
  register(schedule: ScheduleDefinition): void;
  unregister(name: string): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

import type { z } from 'zod';
import type { Logger } from '@mariachi/core';

export interface JobConfig {
  adapter: string;
  redisUrl?: string;
  prefix?: string;
}

export interface RetryConfig {
  attempts: number;
  backoff: 'exponential' | 'linear' | 'fixed';
  delay?: number;
}

export interface JobDefinition<T = unknown> {
  name: string;
  schema: z.ZodType<T>;
  retry: RetryConfig;
  handler: (data: T, ctx: JobContext) => Promise<void>;
}

export interface JobContext {
  logger: Logger;
  traceId: string;
  attemptNumber: number;
  jobId: string;
}

export interface ScheduleDefinition {
  name: string;
  cron: string;
  jobName: string;
  data?: unknown;
}

export interface JobQueue {
  enqueue<T>(
    jobName: string,
    data: T,
    options?: { delay?: number; priority?: number; traceId?: string }
  ): Promise<string>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface JobWorker {
  registerJob<T>(definition: JobDefinition<T>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface JobScheduler {
  register(schedule: ScheduleDefinition): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type JobPriority = 'critical' | 'high' | 'normal' | 'low';

export const JOB_PRIORITY_VALUES: Record<JobPriority, number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
};

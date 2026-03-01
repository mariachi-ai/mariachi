import type { JobQueue, JobWorker, JobDefinition } from '../types';

export interface EnqueuedJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  options?: { delay?: number; priority?: number; traceId?: string };
}

export class TestJobQueue implements JobQueue, JobWorker {
  private readonly jobs: EnqueuedJob[] = [];

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async enqueue<T>(
    jobName: string,
    data: T,
    options?: { delay?: number; priority?: number; traceId?: string }
  ): Promise<string> {
    const id = crypto.randomUUID();
    this.jobs.push({
      id,
      name: jobName,
      data,
      options,
    });
    return id;
  }

  registerJob<T>(_definition: JobDefinition<T>): void {}

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  getEnqueuedJobs<T = unknown>(): EnqueuedJob<T>[] {
    return [...this.jobs] as EnqueuedJob<T>[];
  }
}

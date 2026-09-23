import { JobsError } from '@mariachi/core';
import type { Logger } from '@mariachi/core';
import type { JobConfig, JobQueue, JobWorker, JobScheduler } from './types';
import { BullMQAdapter } from './adapters/bullmq';
import { MemoryJobAdapter } from './adapters/memory';

export type JobBackend = JobQueue & JobWorker & JobScheduler;

export function createJobQueue(config: JobConfig, logger: Logger): JobBackend {
  if (config.adapter === 'bullmq') return new BullMQAdapter(config, logger);
  if (config.adapter === 'memory') return new MemoryJobAdapter(config, logger);
  throw new JobsError('jobs/unknown-adapter', `Unknown job adapter: ${config.adapter}`);
}

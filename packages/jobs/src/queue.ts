import { JobsError } from '@mariachi/core';
import type { Logger } from '@mariachi/core';
import type { JobConfig, JobQueue, JobWorker, JobScheduler } from './types';
import { BullMQAdapter } from './adapters/bullmq';

export function createJobQueue(
  config: JobConfig,
  logger: Logger
): JobQueue & JobWorker & JobScheduler {
  if (config.adapter === 'bullmq') {
    return new BullMQAdapter(config, logger);
  }
  throw new JobsError('jobs/unknown-adapter', `Unknown job adapter: ${config.adapter}`);
}

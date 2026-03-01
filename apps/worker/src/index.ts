import { bootstrap } from '@mariachi/lifecycle';
import { createJobQueue } from '@mariachi/jobs';
import { SendEmailJob } from './jobs/send-email.job';
import { SystemCleanupJob } from './jobs/system-cleanup.job';
import { schedules } from './jobs/schedules';

const { config, logger, startup, shutdown } = bootstrap({
  database: { url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/worker' },
});

const jobAdapter = config.redis?.url ? 'bullmq' : 'memory';
const jobQueue = createJobQueue(
  {
    adapter: jobAdapter,
    redisUrl: config.redis?.url,
  },
  logger
);

jobQueue.registerJob(SendEmailJob);
jobQueue.registerJob(SystemCleanupJob);
for (const schedule of schedules) {
  jobQueue.register(schedule);
}

startup.register({
  name: 'job-queue',
  priority: 10,
  fn: async () => {
    await jobQueue.connect();
    await jobQueue.start();
  },
});

shutdown.register({
  name: 'job-queue',
  priority: 10,
  fn: async () => {
    await jobQueue.stop();
    await jobQueue.disconnect();
  },
});

startup.runAll(logger).catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});

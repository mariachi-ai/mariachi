import { getContainer, KEYS } from '@mariachi/core';
import { createObservability } from '@mariachi/observability';
import { createJobQueue } from '@mariachi/jobs';
import { DefaultJobs } from '@mariachi/jobs';
import { SendNotificationJob } from './jobs/send-notification.job';
import { SyncBillingJob } from './jobs/sync-billing.job';
import { schedules } from './jobs/schedules';

async function main() {
  const { logger } = createObservability({ logging: { adapter: 'pino', level: 'info' } });
  const container = getContainer();
  container.register(KEYS.Logger, logger);

  const queue = createJobQueue({
    adapter: 'bullmq',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    prefix: 'mariachi:jobs',
  }, logger);

  const jobs = new DefaultJobs({ queue });

  jobs.registerJob(SendNotificationJob);
  jobs.registerJob(SyncBillingJob);

  for (const schedule of schedules) {
    queue.register(schedule);
  }

  await queue.connect();
  await queue.start();

  logger.info({}, 'Example worker started');
  logger.info({}, 'This example shows:');
  logger.info({}, '  - Notification delivery jobs (email, SMS, push, in-app)');
  logger.info({}, '  - Billing sync jobs with retry and exponential backoff');
  logger.info({}, '  - Scheduled jobs (daily sync, hourly flush, weekly cleanup)');
  logger.info({}, '  - Jobs abstract class with observability');

  process.on('SIGTERM', async () => {
    await queue.stop();
    await queue.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

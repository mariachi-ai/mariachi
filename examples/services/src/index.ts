import { getContainer, KEYS } from '@mariachi/core';
import { createObservability } from '@mariachi/observability';
import { createCommunication } from '@mariachi/communication';
import { createEventBus } from '@mariachi/events';
import { registerUsersHandlers } from './users/users.handler';
import { setupNotificationSubscribers } from './notifications/notification.subscriber';

async function main() {
  const { logger } = createObservability({ logging: { adapter: 'pino', level: 'info' } });
  const container = getContainer();
  container.register(KEYS.Logger, logger);

  const communication = createCommunication();
  const events = createEventBus({ adapter: 'redis', url: process.env.REDIS_URL ?? 'redis://localhost:6379' });

  container.register(KEYS.Communication, communication);
  container.register(KEYS.EventBus, events);

  registerUsersHandlers(communication);
  await events.connect();
  setupNotificationSubscribers(events, logger);

  logger.info({}, 'Example services started');
  logger.info({}, 'This example shows:');
  logger.info({}, '  - Domain services (UsersService, AppBilling)');
  logger.info({}, '  - Communication layer handler registration');
  logger.info({}, '  - Event-driven notification subscribers');
  logger.info({}, '  - Billing abstract class with custom hooks');
  logger.info({}, '  - Cache-aside pattern in service methods');
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

import { bootstrapApp } from './bootstrap';

async function main() {
  const { logger } = await bootstrapApp();

  logger.info({}, 'Example API starting...');
  logger.info({}, 'This example shows:');
  logger.info({}, '  - Full bootstrap with container DI');
  logger.info({}, '  - API facade with controllers');
  logger.info({}, '  - JWT auth + rate limiting middleware');
  logger.info({}, '  - Billing webhook handling');
  logger.info({}, '  - Communication layer (facade -> service)');
  logger.info({}, '');
  logger.info({}, 'To run: docker compose -f docker-compose.dev.yml up -d && pnpm --filter @mariachi/example-api start');
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

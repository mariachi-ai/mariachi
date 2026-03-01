import { bootstrap } from '@mariachi/lifecycle';
import { createPublicServer } from './servers/public';
import { createAdminServer } from './servers/admin';
import { createWebhookServer } from './servers/webhooks';
import { UsersController } from './controllers/users.controller';
import { BillingController } from './controllers/billing.controller';

const PUBLIC_PORT = Number(process.env.PORT ?? 3000);
const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 3001);
const WEBHOOK_PORT = Number(process.env.WEBHOOK_PORT ?? 3002);

async function main() {
  const { logger, startup, shutdown } = bootstrap();

  const publicServer = createPublicServer()
    .registerController(new UsersController())
    .registerController(new BillingController());

  const adminServer = createAdminServer()
    .registerController(new UsersController());

  const webhookServer = createWebhookServer()
    .registerController(new BillingController());

  startup.register({ name: 'servers', priority: 100, fn: async () => {
    await Promise.all([
      publicServer.listen(PUBLIC_PORT),
      adminServer.listen(ADMIN_PORT),
      webhookServer.listen(WEBHOOK_PORT),
    ]);
    logger.info({ public: PUBLIC_PORT, admin: ADMIN_PORT, webhook: WEBHOOK_PORT }, 'Servers started');
  }});

  shutdown.register({ name: 'servers', priority: 100, fn: async () => {
    await Promise.all([publicServer.close(), adminServer.close(), webhookServer.close()]);
  }});

  await startup.runAll(logger);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

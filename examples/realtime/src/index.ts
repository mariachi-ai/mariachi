import { getContainer, KEYS } from '@mariachi/core';
import { createObservability } from '@mariachi/observability';
import { createAuth } from '@mariachi/auth';
import { createEventBus } from '@mariachi/events';
import { DefaultRealtime, ConnectionStore, WSAdapter } from '@mariachi/realtime';
import { authorizeChannel } from './channels';
import { setupEventBridge } from './event-bridge';

const WS_PORT = Number(process.env.WS_PORT ?? 3003);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function main() {
  const { logger } = createObservability({ logging: { adapter: 'pino', level: 'info' } });
  const container = getContainer();
  container.register(KEYS.Logger, logger);

  const auth = createAuth({ adapter: 'jwt', jwtSecret: process.env.JWT_SECRET ?? 'dev-secret' });
  const events = createEventBus({ adapter: process.env.NATS_URL ? 'nats' : 'redis', url: process.env.NATS_URL ?? REDIS_URL });
  const connectionStore = new ConnectionStore({ redisUrl: REDIS_URL });

  const realtime = new DefaultRealtime({
    connectionStore,
    authorize: authorizeChannel,
  });

  const wsAdapter = new WSAdapter(realtime, {
    port: WS_PORT,
    path: '/ws',
    authenticate: async (token) => {
      try {
        const identity = await auth.verify(token);
        return { userId: identity.userId, tenantId: identity.tenantId };
      } catch {
        return null;
      }
    },
  });

  await events.connect();
  setupEventBridge(events, realtime, logger);
  wsAdapter.start();

  logger.info({ port: WS_PORT }, 'Realtime server started');
  logger.info({}, 'This example shows:');
  logger.info({}, '  - WebSocket server with JWT auth');
  logger.info({}, '  - Channel authorization (user, tenant, chat)');
  logger.info({}, '  - NATS/Redis event bridge to realtime channels');
  logger.info({}, '  - Redis-backed connection state + presence');
  logger.info({}, '');
  logger.info({}, 'Connect: ws://localhost:3003/ws?token=<jwt>');

  process.on('SIGTERM', async () => {
    await wsAdapter.stop();
    await events.disconnect();
    await connectionStore.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

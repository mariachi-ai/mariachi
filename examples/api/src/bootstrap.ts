import { getContainer, KEYS } from '@mariachi/core';
import { loadConfig } from '@mariachi/config';
import { createObservability } from '@mariachi/observability';
import { bootstrap } from '@mariachi/lifecycle';
import { createPostgresDatabase } from '@mariachi/database-postgres';
import { createCache } from '@mariachi/cache';
import { createEventBus } from '@mariachi/events';
import { createAuth, createAuthorization } from '@mariachi/auth';
import { StripeAdapter } from '@mariachi/billing';
import { createRateLimiter } from '@mariachi/rate-limit';

export async function bootstrapApp() {
  const config = loadConfig();
  const { logger, tracer, metrics, errors } = createObservability({
    logging: { adapter: 'pino', level: 'info' },
    tracing: { adapter: process.env.OTEL_ENABLED === 'true' ? 'otel' : undefined },
    metrics: { adapter: process.env.PROMETHEUS_ENABLED === 'true' ? 'prometheus' : undefined },
    errors: { adapter: process.env.SENTRY_DSN ? 'sentry' : undefined, dsn: process.env.SENTRY_DSN },
  });

  const container = getContainer();
  container.register(KEYS.Config, config);
  container.register(KEYS.Logger, logger);
  container.register(KEYS.Tracer, tracer);
  container.register(KEYS.Metrics, metrics);

  const { startup, shutdown, health } = bootstrap();

  const db = createPostgresDatabase({ url: process.env.DATABASE_URL ?? 'postgres://mariachi:dev@localhost:5432/mariachi_dev' });
  const cache = createCache({ adapter: 'redis', url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
  const events = createEventBus({ adapter: process.env.NATS_URL ? 'nats' : 'redis', url: process.env.NATS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379' });
  const auth = createAuth({ adapter: 'jwt', jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production' });
  const authorization = createAuthorization({ permissions: [] });
  const billing = new StripeAdapter({ secretKey: process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder' });
  const rateLimiter = createRateLimiter({ adapter: 'redis', url: process.env.REDIS_URL ?? 'redis://localhost:6379' });

  container.register(KEYS.Database, db);
  container.register(KEYS.Cache, cache);
  container.register(KEYS.EventBus, events);
  container.register(KEYS.Auth, auth);
  container.register(KEYS.Authorization, authorization);
  container.register(KEYS.Billing, billing);
  container.register(KEYS.RateLimit, rateLimiter);

  startup.register({ name: 'database', priority: 1, fn: () => db.connect() });
  startup.register({ name: 'cache', priority: 2, fn: () => cache.connect() });
  startup.register({ name: 'events', priority: 3, fn: () => events.connect() });

  shutdown.register({ name: 'events', priority: 1, fn: () => events.disconnect() });
  shutdown.register({ name: 'cache', priority: 2, fn: () => cache.disconnect() });
  shutdown.register({ name: 'database', priority: 3, fn: () => db.disconnect() });

  return { config, logger, tracer, metrics, startup, shutdown, health, container, db, cache, events, auth, authorization, billing, rateLimiter };
}

import { getContainer, KEYS, type Container, type Logger } from '@mariachi/core';
import { loadConfig, createSecrets } from '@mariachi/config';
import type { AppConfig } from '@mariachi/config';
import { createObservability } from '@mariachi/observability';
import type { TracerAdapter, MetricsAdapter, ErrorTracker } from '@mariachi/observability';
import { StartupManager } from './startup';
import { ShutdownManager } from './shutdown';
import { HealthManager } from './health';

export interface BootstrapResult {
  config: AppConfig;
  logger: Logger;
  tracer: TracerAdapter;
  metrics: MetricsAdapter;
  errors: ErrorTracker;
  container: Container;
  startup: StartupManager;
  shutdown: ShutdownManager;
  health: HealthManager;
}

export function bootstrap(overrides?: Partial<AppConfig>): BootstrapResult {
  const config = loadConfig(overrides);
  const { logger, tracer, metrics, errors } = createObservability(config.observability);
  createSecrets({ adapter: 'env' });

  const container = getContainer();
  container.register(KEYS.Config, config);
  container.register(KEYS.Logger, logger);

  const startup = new StartupManager();
  const shutdown = new ShutdownManager();
  const health = new HealthManager();

  shutdown.installSignalHandlers(logger);

  return {
    config,
    logger,
    tracer,
    metrics,
    errors,
    container,
    startup,
    shutdown,
    health,
  };
}

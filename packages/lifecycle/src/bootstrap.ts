import { createContainer, getContainer, setContainer, KEYS, type Container, type Logger } from '@mariachi/core';
import { loadConfig, createSecrets, type AppConfig, type AppConfigInput, type LoadConfigOptions, type Secrets } from '@mariachi/config';
import {
  createObservability,
  ConsoleLoggerAdapter,
  NoopTracerAdapter,
  NoopMetricsAdapter,
  NoopErrorTracker,
  setupOpenTelemetry,
} from '@mariachi/observability';
import type { TracerAdapter, MetricsAdapter, ErrorTracker } from '@mariachi/observability';
import { Lifecycle } from './lifecycle';
import type { StartupManager } from './startup';
import type { ShutdownManager } from './shutdown';
import type { HealthManager } from './health';

export interface BootstrapOptions {
  config?: AppConfigInput;
  configOptions?: LoadConfigOptions;
  /** Defaults to the global container. */
  container?: Container;
  /** Install SIGTERM/SIGINT handlers. Default true. */
  installSignalHandlers?: boolean;
  /** Log and report unhandled rejections / uncaught exceptions. Default true. */
  captureProcessErrors?: boolean;
}

export interface BootstrapResult {
  config: AppConfig;
  logger: Logger;
  tracer: TracerAdapter;
  metrics: MetricsAdapter;
  errors: ErrorTracker;
  secrets: Secrets;
  container: Container;
  lifecycle: Lifecycle;
  startup: StartupManager;
  shutdown: ShutdownManager;
  health: HealthManager;
}

/**
 * Composition root: loads config, builds observability, and registers Config, Logger, Tracer,
 * Metrics, ErrorTracker, Secrets and Lifecycle in the container. Construct services after this.
 */
export function bootstrap(options: BootstrapOptions = {}): BootstrapResult {
  const config = loadConfig(options.config, options.configOptions);
  const observability = createObservability({ serviceName: config.serviceName, ...config.observability });
  const { logger, tracer, metrics, errors } = observability;
  const secrets = createSecrets({ adapter: 'env' });
  const lifecycle = new Lifecycle(logger);

  const container = options.container ?? getContainer();
  container.register(KEYS.Config, config);
  container.register(KEYS.Logger, logger);
  container.register(KEYS.Tracer, tracer);
  container.register(KEYS.Metrics, metrics);
  container.register(KEYS.ErrorTracker, errors);
  container.register(KEYS.Secrets, secrets);
  container.register(KEYS.Lifecycle, lifecycle);

  const tracing = config.observability?.tracing;
  if (tracing && tracing.adapter !== 'noop' && tracing.endpoint) {
    const stopOtel = setupOpenTelemetry({ serviceName: config.serviceName, endpoint: tracing.endpoint });
    lifecycle.shutdown.register({ name: 'opentelemetry', priority: -1000, fn: stopOtel });
  }
  if (errors.flush) {
    lifecycle.shutdown.register({ name: 'error-tracker', priority: -1001, fn: async () => void (await errors.flush?.()) });
  }

  if (options.captureProcessErrors !== false) {
    process.on('unhandledRejection', (reason) => {
      const err = reason instanceof Error ? reason : new Error(String(reason)); // mariachi-lint-ignore
      logger.error({ err }, 'Unhandled promise rejection');
      errors.captureException(err);
    });
    process.on('uncaughtException', (err) => {
      logger.error({ err }, 'Uncaught exception');
      errors.captureException(err);
    });
  }

  if (options.installSignalHandlers !== false) {
    lifecycle.installSignalHandlers({ timeoutMs: config.server.shutdownTimeoutMs });
  }

  return {
    config,
    logger,
    tracer,
    metrics,
    errors,
    secrets,
    container,
    lifecycle,
    startup: lifecycle.startup,
    shutdown: lifecycle.shutdown,
    health: lifecycle.health,
  };
}

/**
 * Isolated bootstrap for tests: fresh global container, console logger at `warn`, noop tracing
 * and metrics, no signal handlers, and config built only from `config` (the process environment is ignored).
 */
export function bootstrapForTest(options: { config?: AppConfigInput; env?: Record<string, string> } = {}): BootstrapResult & {
  restore: () => void;
} {
  const container = createContainer();
  const previous = setContainer(container);
  const config = loadConfig({ env: 'test', ...options.config }, { env: options.env ?? {} });
  const logger = new ConsoleLoggerAdapter({}, 'warn');
  const tracer = new NoopTracerAdapter();
  const metrics = new NoopMetricsAdapter();
  const errors = new NoopErrorTracker();
  const secrets = createSecrets({ adapter: 'env' });
  const lifecycle = new Lifecycle(logger);

  container.register(KEYS.Config, config);
  container.register(KEYS.Logger, logger);
  container.register(KEYS.Tracer, tracer);
  container.register(KEYS.Metrics, metrics);
  container.register(KEYS.ErrorTracker, errors);
  container.register(KEYS.Secrets, secrets);
  container.register(KEYS.Lifecycle, lifecycle);

  return {
    config,
    logger,
    tracer,
    metrics,
    errors,
    secrets,
    container,
    lifecycle,
    startup: lifecycle.startup,
    shutdown: lifecycle.shutdown,
    health: lifecycle.health,
    restore: () => void setContainer(previous),
  };
}

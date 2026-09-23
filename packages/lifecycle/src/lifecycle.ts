import type { Disposable, Logger } from '@mariachi/core';
import { StartupManager } from './startup';
import { ShutdownManager, type SignalHandlerOptions } from './shutdown';
import { HealthManager } from './health';

export interface ManageOptions {
  /** Startup order (lower first). Shutdown runs in reverse. Default 100. */
  priority?: number;
  /** Include in readiness checks. Default true. */
  healthCheck?: boolean;
  /** Readiness failure only degrades instead of failing. Default true (critical). */
  critical?: boolean;
  shutdownTimeoutMs?: number;
}

/** Ties startup, shutdown and health together so each resource is registered once. */
export class Lifecycle {
  readonly startup = new StartupManager();
  readonly shutdown = new ShutdownManager();
  readonly health = new HealthManager();

  constructor(private readonly logger: Logger) {}

  /**
   * Registers a Disposable: `connect()` on start, `disconnect()` on shutdown (reverse order),
   * `isHealthy()` as a readiness check.
   */
  manage<T extends Disposable>(name: string, resource: T, options: ManageOptions = {}): T {
    const priority = options.priority ?? 100;
    this.startup.register({ name, priority, fn: () => resource.connect() });
    this.shutdown.register({ name, priority, fn: () => resource.disconnect(), timeoutMs: options.shutdownTimeoutMs });
    if (options.healthCheck !== false) {
      this.health.register({ name, fn: () => resource.isHealthy(), critical: options.critical });
    }
    return resource;
  }

  /** Runs startup hooks and marks the process as started. */
  async start(): Promise<void> {
    await this.startup.runAll(this.logger);
    this.health.markStarted();
  }

  async stop(): Promise<boolean> {
    this.health.markDraining();
    return this.shutdown.runAll(this.logger);
  }

  installSignalHandlers(options: SignalHandlerOptions = {}): () => void {
    return this.shutdown.installSignalHandlers(this.logger, {
      ...options,
      onBeforeShutdown: () => {
        this.health.markDraining();
        options.onBeforeShutdown?.();
      },
    });
  }
}

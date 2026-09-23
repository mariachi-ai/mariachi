import type { Logger, TracerAdapter, MetricsAdapter } from '@mariachi/core';
import { resolveInstrumentation, type InstrumentationDeps } from '@mariachi/core';
import type { Instrumentable, Disposable } from '@mariachi/core';
import type { DatabaseAdapter } from './types';

export abstract class Database implements Instrumentable, Disposable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly dbClient: DatabaseAdapter;

  constructor(config: { client: DatabaseAdapter }, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.dbClient = config.client;
  }

  async connect(): Promise<void> {
    this.logger.info({}, 'Connecting to database');
    await this.dbClient.connect();
  }

  async disconnect(): Promise<void> {
    this.logger.info({}, 'Disconnecting from database');
    await this.dbClient.disconnect();
  }

  /** Runs `SELECT 1`; a pool that exists but can't reach the server is unhealthy. */
  async isHealthy(): Promise<boolean> {
    if (!this.dbClient.isConnected()) return false;
    return this.dbClient.ping();
  }
}

export class DefaultDatabase extends Database {}

import type { Logger, TracerAdapter, MetricsAdapter } from '@mariachi/core';
import { getContainer, KEYS } from '@mariachi/core';
import type { Instrumentable, Disposable } from '@mariachi/core';
import type { DatabaseAdapter } from './types';

export abstract class Database implements Instrumentable, Disposable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly dbClient: DatabaseAdapter;

  constructor(config: { client: DatabaseAdapter }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
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

  async isHealthy(): Promise<boolean> {
    return this.dbClient.isConnected();
  }
}

export class DefaultDatabase extends Database {}

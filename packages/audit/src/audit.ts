import type { Context, Logger, TracerAdapter, MetricsAdapter, PaginationParams, PaginatedResult } from '@mariachi/core';
import { withSpan, getContainer, KEYS } from '@mariachi/core';
import type { Instrumentable } from '@mariachi/core';
import type { AuditLogger, AuditQuery, AuditLogOptions, AuditQueryFilter, AuditEntry } from './types';

export abstract class Audit implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly auditLogger: AuditLogger;
  protected readonly auditQuery: AuditQuery;

  constructor(config: { auditLogger: AuditLogger; auditQuery: AuditQuery }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.auditLogger = config.auditLogger;
    this.auditQuery = config.auditQuery;
  }

  async log(ctx: Context, options: AuditLogOptions): Promise<void> {
    return withSpan(this.tracer, 'audit.log', { action: options.action, resource: options.resource }, async () => {
      this.logger.debug({ traceId: ctx.traceId, action: options.action, resource: options.resource }, 'Writing audit entry');
      await this.auditLogger.log(options);
      this.metrics?.increment('audit.entries.written', 1, { action: options.action });
    });
  }

  async query(ctx: Context, filter: AuditQueryFilter, pagination: PaginationParams): Promise<PaginatedResult<AuditEntry>> {
    return withSpan(this.tracer, 'audit.query', {}, async () => {
      return this.auditQuery.find(filter, pagination);
    });
  }
}

export class DefaultAudit extends Audit {}

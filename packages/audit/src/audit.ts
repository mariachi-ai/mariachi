import type { Context, Logger, TracerAdapter, MetricsAdapter, PaginationParams, PaginatedResult } from '@mariachi/core';
import { AuditError, withSpan, resolveInstrumentation, type InstrumentationDeps } from '@mariachi/core';
import type { Instrumentable } from '@mariachi/core';
import type { AuditLogger, AuditQuery, AuditLogOptions, AuditQueryFilter, AuditEntry, AuditMaintenance, AuditChainVerification } from './types';

export abstract class Audit implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly auditLogger: AuditLogger;
  protected readonly auditQuery: AuditQuery;

  constructor(config: { auditLogger: AuditLogger; auditQuery: AuditQuery }, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.auditLogger = config.auditLogger;
    this.auditQuery = config.auditQuery;
  }

  async log(ctx: Context, options: AuditLogOptions): Promise<void> {
    return withSpan(this.tracer, 'audit.log', { action: options.action, resource: options.resource }, async () => {
      this.logger.debug({ traceId: ctx.traceId, action: options.action, resource: options.resource }, 'Writing audit entry');
      await this.auditLogger.log(ctx, options);
      this.metrics?.increment('audit.entries.written', 1, { action: options.action });
    });
  }

  async query(ctx: Context, filter: AuditQueryFilter, pagination: PaginationParams): Promise<PaginatedResult<AuditEntry>> {
    return withSpan(this.tracer, 'audit.query', {}, async () => {
      return this.auditQuery.find(ctx, filter, pagination);
    });
  }

  async retain(ctx: Context, olderThan: Date): Promise<number> {
    const maintenance = this.auditQuery as AuditQuery & Partial<AuditMaintenance>;
    if (!maintenance.retain) throw new AuditError('audit/not-supported', 'This audit store does not support retention');
    return maintenance.retain(ctx, olderThan);
  }

  async verifyChain(ctx: Context, tenantId?: string | null): Promise<AuditChainVerification> {
    const maintenance = this.auditQuery as AuditQuery & Partial<AuditMaintenance>;
    if (!maintenance.verifyChain) throw new AuditError('audit/not-supported', 'This audit store does not support chain verification');
    return maintenance.verifyChain(ctx, tenantId);
  }

  async findByResource(ctx: Context, resource: string, resourceId: string): Promise<AuditEntry[]> {
    return this.auditQuery.findByResource(ctx, resource, resourceId);
  }

  async export(ctx: Context, filter: AuditQueryFilter): Promise<string> {
    const maintenance = this.auditQuery as AuditQuery & Partial<AuditMaintenance>;
    if (maintenance.export) return maintenance.export(ctx, filter);
    const page = await this.query(ctx, filter, { page: 1, pageSize: 10_000 });
    return page.data.map((entry) => JSON.stringify(entry)).join('\n');
  }
}

export class DefaultAudit extends Audit {}

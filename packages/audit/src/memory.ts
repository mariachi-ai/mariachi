import type { Context, PaginatedResult, PaginationParams } from '@mariachi/core';
import { auditCanonical, chainHash, GENESIS_HASH } from './chain';
import type { AuditChainVerification, AuditEntry, AuditLogOptions, AuditLogger, AuditMaintenance, AuditQuery, AuditQueryFilter } from './types';

/** In-process append-only log with optional per-tenant hash chaining. For tests and single-node use. */
export class MemoryAuditLog implements AuditLogger, AuditQuery, AuditMaintenance {
  readonly entries: AuditEntry[] = [];
  private readonly tails = new Map<string, { hash: string; seq: number }>();

  constructor(private readonly chain = true) {}

  async log(ctx: Context, options: AuditLogOptions): Promise<void> {
    const occurredAt = new Date();
    const tenantId = options.tenantId ?? ctx.tenantId ?? null;
    const tail = this.tails.get(tenantId ?? '') ?? { hash: GENESIS_HASH, seq: 0 };
    const canonical = auditCanonical({ ...options, tenantId, occurredAt: occurredAt.toISOString() });
    const entryHash = this.chain ? chainHash(tail.hash, canonical) : '';
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      actor: options.actor,
      action: options.action,
      resource: options.resource,
      resourceId: options.resourceId,
      tenantId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      occurredAt,
      metadata: options.metadata,
      prevHash: this.chain ? tail.hash : null,
      entryHash,
      chainSeq: this.chain ? tail.seq + 1 : null,
    };
    this.entries.push(entry);
    if (this.chain) this.tails.set(tenantId ?? '', { hash: entryHash, seq: tail.seq + 1 });
  }

  async find(ctx: Context, filter: AuditQueryFilter, pagination: PaginationParams): Promise<PaginatedResult<AuditEntry>> {
    const matched = this.match(ctx, filter);
    const start = (pagination.page - 1) * pagination.pageSize;
    const data = matched.slice(start, start + pagination.pageSize);
    return {
      data,
      total: matched.length,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.max(1, Math.ceil(matched.length / pagination.pageSize)),
    };
  }

  async findByResource(ctx: Context, resource: string, resourceId: string): Promise<AuditEntry[]> {
    return this.match(ctx, { resource, resourceId });
  }

  async retain(_ctx: Context, olderThan: Date): Promise<number> {
    const before = this.entries.length;
    const kept = this.entries.filter((e) => e.occurredAt >= olderThan);
    this.entries.length = 0;
    this.entries.push(...kept);
    return before - kept.length;
  }

  async export(ctx: Context, filter: AuditQueryFilter): Promise<string> {
    return this.match(ctx, filter).map((e) => JSON.stringify(e)).join('\n');
  }

  async verifyChain(ctx: Context, tenantId: string | null | undefined = ctx.tenantId): Promise<AuditChainVerification> {
    let checked = 0;
    let expectedPrev: string | undefined;
    const chain = this.entries
      .filter((e) => (e.tenantId ?? null) === (tenantId ?? null) && e.chainSeq != null)
      .sort((a, b) => a.chainSeq! - b.chainSeq!);
    for (const e of chain) {
      if (expectedPrev !== undefined && e.prevHash !== expectedPrev) return { ok: false, checked, brokenAt: e.id, reason: 'link-mismatch' };
      const canonical = auditCanonical({ ...e, occurredAt: e.occurredAt.toISOString() });
      if (chainHash(e.prevHash ?? GENESIS_HASH, canonical) !== e.entryHash) return { ok: false, checked, brokenAt: e.id, reason: 'hash-mismatch' };
      expectedPrev = e.entryHash;
      checked += 1;
    }
    return { ok: true, checked };
  }

  private match(ctx: Context, filter: AuditQueryFilter): AuditEntry[] {
    const tenantId = ctx.tenantId ?? filter.tenantId;
    return this.entries.filter((e) => {
      if (tenantId && e.tenantId !== tenantId) return false;
      if (filter.actor && e.actor !== filter.actor) return false;
      if (filter.action && e.action !== filter.action) return false;
      if (filter.resource && e.resource !== filter.resource) return false;
      if (filter.resourceId && e.resourceId !== filter.resourceId) return false;
      if (filter.from && e.occurredAt < filter.from) return false;
      if (filter.to && e.occurredAt > filter.to) return false;
      return true;
    });
  }
}

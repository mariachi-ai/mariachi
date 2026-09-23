import { and, asc, count, desc, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { AuditError, type Context, type PaginatedResult, type PaginationParams } from '@mariachi/core';
import { compileTable, type DrizzleDb } from '@mariachi/database-postgres';
import { AUDIT_APPEND_ONLY_SQL, auditCanonical, chainHash, GENESIS_HASH } from '../chain';
import { auditLogsTable } from '../schema/audit-logs';
import type { AuditEnqueue } from '../repository-logger';
import type {
  AuditChainVerification,
  AuditEntry,
  AuditLogOptions,
  AuditLogger,
  AuditMaintenance,
  AuditQuery,
  AuditQueryFilter,
} from '../types';

const logs = compileTable(auditLogsTable);
type Row = typeof logs.$inferSelect;

const PAGE = 1_000;

export interface DrizzleAuditLogOptions {
  /** Hash-link each tenant's entries. Default true. */
  chain?: boolean;
  /** Hand the write to a queue; on enqueue failure the entry is written inline. */
  enqueue?: AuditEnqueue;
}

/** Installs the trigger that makes `audit_logs` append-only. Idempotent; run it after migrations. */
export async function installAuditAppendOnly(db: DrizzleDb): Promise<void> {
  await db.execute(sql.raw(AUDIT_APPEND_ONLY_SQL));
}

function toEntry(r: Row): AuditEntry {
  return {
    id: r.id,
    actor: r.actor,
    action: r.action,
    resource: r.resource,
    resourceId: r.resourceId,
    tenantId: r.tenantId ?? null,
    ipAddress: r.ipAddress ?? undefined,
    userAgent: r.userAgent ?? undefined,
    occurredAt: r.occurredAt,
    metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
    prevHash: r.prevHash ?? null,
    entryHash: r.entryHash,
    chainSeq: r.chainSeq ?? null,
  };
}

function tenantIs(tenantId: string | null | undefined): SQL {
  return tenantId ? eq(logs.tenantId, tenantId) : isNull(logs.tenantId);
}

/**
 * Postgres audit log: writer, tenant-scoped query, retention, export and chain verification.
 * The chain tail is read from the table under a per-tenant advisory lock, so it survives restarts
 * and stays linear across instances.
 */
export class DrizzleAuditLog implements AuditLogger, AuditQuery, AuditMaintenance {
  private readonly chain: boolean;
  private readonly enqueue?: AuditEnqueue;

  constructor(private readonly db: DrizzleDb, options: DrizzleAuditLogOptions = {}) {
    this.chain = options.chain ?? true;
    this.enqueue = options.enqueue;
  }

  async log(ctx: Context, entry: AuditLogOptions): Promise<void> {
    const write = () => this.write(ctx, entry);
    if (!this.enqueue) return write();
    try {
      await this.enqueue(ctx, write);
    } catch (error) {
      try {
        await write();
      } catch (fallback) {
        throw new AuditError('audit/enqueue-failed', 'Audit enqueue failed and the inline write also failed', {
          enqueue: error instanceof Error ? error.message : String(error),
          write: fallback instanceof Error ? fallback.message : String(fallback),
        });
      }
    }
  }

  private async write(ctx: Context, entry: AuditLogOptions): Promise<void> {
    const tenantId = entry.tenantId ?? ctx.tenantId ?? null;
    const base = {
      actor: entry.actor,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      tenantId,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? null,
    };
    try {
      if (!this.chain) {
        await this.db.insert(logs).values({ ...base, occurredAt: new Date() });
        return;
      }
      await this.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`audit:${tenantId ?? ''}`}, 0))`);
        const [last] = await tx
          .select({ entryHash: logs.entryHash, chainSeq: logs.chainSeq })
          .from(logs)
          .where(and(tenantIs(tenantId), isNotNull(logs.chainSeq)))
          .orderBy(desc(logs.chainSeq))
          .limit(1);
        const prevHash = last?.entryHash ?? GENESIS_HASH;
        const occurredAt = new Date();
        const entryHash = chainHash(prevHash, auditCanonical({ ...entry, tenantId, occurredAt: occurredAt.toISOString() }));
        await tx.insert(logs).values({ ...base, occurredAt, prevHash, entryHash, chainSeq: (last?.chainSeq ?? 0) + 1 });
      });
    } catch (error) {
      throw new AuditError('audit/write-failed', error instanceof Error ? error.message : String(error), { action: entry.action });
    }
  }

  private where(ctx: Context, filter: AuditQueryFilter): SQL | undefined {
    const tenantId = ctx.tenantId ?? filter.tenantId;
    const conditions: SQL[] = [];
    if (tenantId) conditions.push(eq(logs.tenantId, tenantId));
    if (filter.actor) conditions.push(eq(logs.actor, filter.actor));
    if (filter.action) conditions.push(eq(logs.action, filter.action));
    if (filter.resource) conditions.push(eq(logs.resource, filter.resource));
    if (filter.resourceId) conditions.push(eq(logs.resourceId, filter.resourceId));
    if (filter.from) conditions.push(gte(logs.occurredAt, filter.from));
    if (filter.to) conditions.push(lte(logs.occurredAt, filter.to));
    return conditions.length ? and(...conditions) : undefined;
  }

  async find(ctx: Context, filter: AuditQueryFilter, pagination: PaginationParams): Promise<PaginatedResult<AuditEntry>> {
    const where = this.where(ctx, filter);
    const [{ total }] = await this.db.select({ total: count() }).from(logs).where(where);
    const rows = await this.db
      .select()
      .from(logs)
      .where(where)
      .orderBy(desc(logs.occurredAt), desc(logs.id))
      .limit(pagination.pageSize)
      .offset((pagination.page - 1) * pagination.pageSize);
    return {
      data: rows.map(toEntry),
      total: Number(total),
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: Math.max(1, Math.ceil(Number(total) / pagination.pageSize)),
    };
  }

  async findByResource(ctx: Context, resource: string, resourceId: string): Promise<AuditEntry[]> {
    const rows = await this.db
      .select()
      .from(logs)
      .where(this.where(ctx, { resource, resourceId }))
      .orderBy(desc(logs.occurredAt), desc(logs.id));
    return rows.map(toEntry);
  }

  /**
   * Deletes entries older than `olderThan` (only `ctx.tenantId`'s when set). Runs in maintenance
   * mode, the one path the append-only trigger lets through. A verified chain then starts at the
   * oldest remaining entry.
   */
  async retain(ctx: Context, olderThan: Date): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('mariachi.audit_maintenance', 'on', true)`);
      const conditions = [lt(logs.occurredAt, olderThan)];
      if (ctx.tenantId) conditions.push(eq(logs.tenantId, ctx.tenantId));
      const deleted = await tx.delete(logs).where(and(...conditions)).returning({ id: logs.id });
      return deleted.length;
    });
  }

  /** JSON Lines, oldest first, read in keyset pages so large exports don't hold one huge query. */
  async export(ctx: Context, filter: AuditQueryFilter): Promise<string> {
    const lines: string[] = [];
    for await (const entry of this.iterate(ctx, filter)) lines.push(JSON.stringify(entry));
    return lines.join('\n');
  }

  /** Every matching entry, oldest first. */
  async *iterate(ctx: Context, filter: AuditQueryFilter = {}): AsyncIterable<AuditEntry> {
    const base = this.where(ctx, filter);
    let cursor: { occurredAt: Date; id: string } | undefined;
    for (;;) {
      const after = cursor
        ? or(gt(logs.occurredAt, cursor.occurredAt), and(eq(logs.occurredAt, cursor.occurredAt), gt(logs.id, cursor.id)))
        : undefined;
      const rows = await this.db
        .select()
        .from(logs)
        .where(and(base, after))
        .orderBy(asc(logs.occurredAt), asc(logs.id))
        .limit(PAGE);
      for (const row of rows) yield toEntry(row);
      if (rows.length < PAGE) return;
      const last = rows[rows.length - 1]!;
      cursor = { occurredAt: last.occurredAt, id: last.id };
    }
  }

  /**
   * Recomputes the tenant's chain and reports the first entry whose hash or link does not match.
   * Defaults to `ctx.tenantId`; pass `null` for entries without a tenant.
   */
  async verifyChain(ctx: Context, tenantId: string | null | undefined = ctx.tenantId): Promise<AuditChainVerification> {
    let checked = 0;
    let expectedPrev: string | undefined;
    let afterSeq = 0;
    for (;;) {
      const rows = await this.db
        .select()
        .from(logs)
        .where(and(tenantIs(tenantId), isNotNull(logs.chainSeq), gt(logs.chainSeq, afterSeq)))
        .orderBy(asc(logs.chainSeq))
        .limit(PAGE);
      for (const row of rows) {
        // The oldest remaining row anchors the chain (retention may have removed its predecessors).
        if (expectedPrev !== undefined && row.prevHash !== expectedPrev) {
          return { ok: false, checked, brokenAt: row.id, reason: 'link-mismatch' };
        }
        const recomputed = chainHash(
          row.prevHash ?? GENESIS_HASH,
          auditCanonical({
            actor: row.actor,
            action: row.action,
            resource: row.resource,
            resourceId: row.resourceId,
            tenantId: row.tenantId,
            ipAddress: row.ipAddress ?? undefined,
            userAgent: row.userAgent ?? undefined,
            metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
            occurredAt: row.occurredAt.toISOString(),
          }),
        );
        if (recomputed !== row.entryHash) return { ok: false, checked, brokenAt: row.id, reason: 'hash-mismatch' };
        expectedPrev = row.entryHash;
        checked += 1;
      }
      if (rows.length < PAGE) return { ok: true, checked };
      afterSeq = rows[rows.length - 1]!.chainSeq!;
    }
  }
}

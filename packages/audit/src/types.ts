import type { Context, PaginationParams, PaginatedResult } from '@mariachi/core';

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  resource: string;
  resourceId: string;
  tenantId: string | null;
  ipAddress?: string;
  userAgent?: string;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
  prevHash?: string | null;
  entryHash?: string;
  /** Position in the tenant's hash chain (Postgres store). */
  chainSeq?: number | null;
}

export interface AuditLogOptions {
  actor: string;
  action: string;
  resource: string;
  resourceId: string;
  tenantId?: string | null;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogger {
  log(ctx: Context, entry: AuditLogOptions): Promise<void>;
}

export interface AuditMaintenance {
  /** Deletes entries older than `olderThan`. The append-only trigger allows this only in maintenance mode. */
  retain(ctx: Context, olderThan: Date): Promise<number>;
  /** JSON Lines export of matching entries. */
  export(ctx: Context, filter: AuditQueryFilter): Promise<string>;
  /** Recomputes the hash chain. Stores without chaining omit it. */
  verifyChain?(ctx: Context, tenantId?: string | null): Promise<AuditChainVerification>;
}

export interface AuditQueryFilter {
  actor?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  tenantId?: string;
  from?: Date;
  to?: Date;
}

/** Reads are tenant-scoped: when `ctx.tenantId` is set, only that tenant's entries are returned. */
export interface AuditQuery {
  find(ctx: Context, filter: AuditQueryFilter, pagination: PaginationParams): Promise<PaginatedResult<AuditEntry>>;
  findByResource(ctx: Context, resource: string, resourceId: string): Promise<AuditEntry[]>;
}

export type AuditChainVerification =
  | { ok: true; checked: number }
  | { ok: false; checked: number; brokenAt: string; reason: 'hash-mismatch' | 'link-mismatch' };

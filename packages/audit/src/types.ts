import type { PaginationParams, PaginatedResult } from '@mariachi/core';

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
  log(entry: AuditLogOptions): Promise<void>;
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

export interface AuditQuery {
  find(filter: AuditQueryFilter, pagination: PaginationParams): Promise<PaginatedResult<AuditEntry>>;
  findByResource(resource: string, resourceId: string): Promise<AuditEntry[]>;
}

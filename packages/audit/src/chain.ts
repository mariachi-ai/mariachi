import { createHash } from 'node:crypto';
import type { AuditLogOptions } from './types';

export const GENESIS_HASH = '0'.repeat(64);

/** JSON with object keys sorted at every level, so the text survives a jsonb round trip. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Canonical payload hashed into the chain. Every stored field except the hashes and the id. */
export function auditCanonical(entry: AuditLogOptions & { occurredAt: string }): string {
  return stableStringify({
    actor: entry.actor,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId,
    tenantId: entry.tenantId ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    occurredAt: entry.occurredAt,
    metadata: entry.metadata ?? null,
  });
}

export function chainHash(prevHash: string, canonical: string): string {
  return createHash('sha256').update(`${prevHash}\n${canonical}`).digest('hex');
}

/**
 * Blocks UPDATE and DELETE on `audit_logs`. Deletes are allowed inside a transaction
 * that sets `mariachi.audit_maintenance` to `on`, which is how retention runs.
 */
export const AUDIT_APPEND_ONLY_SQL = `
CREATE OR REPLACE FUNCTION mariachi_audit_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('mariachi.audit_maintenance', true) = 'on' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION mariachi_audit_append_only();
`;

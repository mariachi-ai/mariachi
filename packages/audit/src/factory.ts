import type { AuditLogger, AuditQuery } from './types';

export function createAuditLogger(logger: AuditLogger): AuditLogger {
  return logger;
}

export function createAuditQuery(query: AuditQuery): AuditQuery {
  return query;
}

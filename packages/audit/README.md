# @mariachi/audit

Records who did what to which resource. On Postgres the log is append-only (a trigger blocks
UPDATE and DELETE) and hash-chained per tenant, so tampering is detectable. Reads are
tenant-scoped, and retention and export are built in.

**Status: beta.** Covered by unit tests and Postgres integration tests. The API can change before 1.0.

Guide: [audit.md](../core/docs/audit.md)

## Imports

| Import | Contents |
| --- | --- |
| `@mariachi/audit` | `DefaultAudit`, `MemoryAuditLog`, `RepositoryAuditLogger`, chain helpers, types |
| `@mariachi/audit/schema` | `auditLogsTable` |
| `@mariachi/audit/postgres` | `DrizzleAuditLog`, `installAuditAppendOnly` |

## Public API

| Export | Purpose |
| --- | --- |
| `DefaultAudit` | `log(ctx, entry)`, `query(ctx, filter, page)`, `findByResource(ctx, resource, id)`, `export(ctx, filter)`, `retain(ctx, olderThan)`, `verifyChain(ctx, tenantId?)` |
| `DrizzleAuditLog` | Postgres writer, query, maintenance and chain verification in one; `iterate(ctx, filter)` streams entries |
| `installAuditAppendOnly(db)` | Installs the append-only trigger (idempotent) |
| `MemoryAuditLog` | Same behavior in memory, for tests |
| `AUDIT_APPEND_ONLY_SQL`, `auditCanonical`, `chainHash`, `GENESIS_HASH` | For custom stores and external verifiers |

## Config

| Option | Default | Notes |
| --- | --- | --- |
| `chain` | `true` (`DrizzleAuditLog`) | Hash-link entries per tenant |
| `enqueue` | none | `(ctx, write) => Promise<void>` to write off the request path; falls back to an inline write |

Errors are `AuditError` (`audit/write-failed`, `audit/enqueue-failed`, `audit/not-supported`).

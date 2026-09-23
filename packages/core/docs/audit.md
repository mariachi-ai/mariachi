# Audit

`@mariachi/audit` records who did what to which resource. On Postgres the log is append-only at
the database level and can be hash-chained, so a changed or deleted row is detectable.

## Wire it

```ts
import { DefaultAudit } from '@mariachi/audit';
import { DrizzleAuditLog, installAuditAppendOnly } from '@mariachi/audit/postgres';

await installAuditAppendOnly(db);      // after migrations; idempotent. Blocks UPDATE and DELETE on audit_logs.
const log = new DrizzleAuditLog(db, { chain: true });
const audit = new DefaultAudit({ auditLogger: log, auditQuery: log }, instrumentation);
```

Add `auditLogsTable` from `@mariachi/audit/schema`. `MemoryAuditLog` implements the same
interfaces for tests.

## Write

```ts
await audit.log(ctx, {
  actor: ctx.userId!, action: 'invoice.void', resource: 'invoice', resourceId: invoice.id,
  ipAddress: request.ip, userAgent: request.headers['user-agent'],
  metadata: { reason, previousStatus: invoice.status },
});
```

`ctx` is passed on every call, and the entry's tenant is `ctx.tenantId` unless you set `tenantId`.
To keep audit writes off the request path, pass `enqueue: (ctx, write) => ...` to
`DrizzleAuditLog`. If enqueueing fails, the entry is written inline instead of being dropped
(`audit/enqueue-failed` only when both fail).

## Hash chain

With `chain: true`, every entry stores `prevHash` and `entryHash = sha256(prevHash + canonical entry)`,
and a per-tenant `chainSeq`. The previous hash is read from the table under a per-tenant advisory
lock, so the chain stays linear across restarts and across any number of instances. The canonical
form sorts object keys at every level, so it survives the `jsonb` round trip.

```ts
const result = await audit.verifyChain(ctx);             // ctx.tenantId's chain; pass null for tenantless entries
// { ok: true, checked: 1834 } or { ok: false, checked, brokenAt: '<entry id>', reason: 'hash-mismatch' | 'link-mismatch' }
```

Run it on a schedule and alert on `ok: false`. The trigger stops accidental edits; the chain
catches deliberate ones by someone who could disable the trigger.

`RepositoryAuditLogger` can also chain, but it keeps the tail in process memory: it restarts on
every boot and forks across instances. Use `DrizzleAuditLog` in production.

## Read

Reads are tenant-scoped. With `ctx.tenantId` set, only that tenant's entries come back, whatever
the filter says.

```ts
await audit.query(ctx, { resource: 'invoice', from: monthStart }, { page: 1, pageSize: 50 });
await audit.findByResource(ctx, 'invoice', invoice.id);
```

## Retention and export

```ts
const ndjson = await audit.export(ctx, { from: yearStart, to: yearEnd });   // JSON Lines, oldest first
const removed = await audit.retain(systemCtx, twoYearsAgo);                 // one tenant's entries when ctx has a tenant
```

`retain` is the only way to delete: it runs in a transaction that sets
`mariachi.audit_maintenance = on`, the one exception the trigger allows. After retention, chain
verification starts at the oldest remaining entry.

## Errors

`AuditError`: `audit/write-failed`, `audit/enqueue-failed` and `audit/not-supported` (retention,
export or verification on a store that lacks them).

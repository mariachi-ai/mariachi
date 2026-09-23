import { describe, expect, it } from 'vitest';
import { createContext } from '@mariachi/core';
import { DefaultAudit } from './audit';
import { auditCanonical, chainHash, GENESIS_HASH } from './chain';
import { MemoryAuditLog } from './memory';
import { RepositoryAuditLogger } from './repository-logger';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

describe('audit', () => {
  it('hash-chains entries and exports them', async () => {
    const log = new MemoryAuditLog(true);
    const audit = new DefaultAudit({ auditLogger: log, auditQuery: log }, { logger: silent });
    const ctx = createContext({ logger: silent, tenantId: 't1' });
    await audit.log(ctx, { actor: 'u1', action: 'create', resource: 'user', resourceId: 'u1' });
    await audit.log(ctx, { actor: 'u1', action: 'update', resource: 'user', resourceId: 'u1' });
    expect(log.entries[0]?.prevHash).toBe(GENESIS_HASH);
    expect(log.entries[1]?.prevHash).toBe(log.entries[0]?.entryHash);
    expect(log.entries[1]?.entryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(chainHash(GENESIS_HASH, 'x')).toHaveLength(64);
    const exported = await audit.export(ctx, { resource: 'user' });
    expect(exported.split('\n')).toHaveLength(2);
    expect(await log.retain(ctx, new Date(Date.now() + 1000))).toBe(2);
  });

  it('chains per tenant, scopes reads to ctx.tenantId, and detects tampering', async () => {
    const log = new MemoryAuditLog(true);
    const audit = new DefaultAudit({ auditLogger: log, auditQuery: log }, { logger: silent });
    const t1 = createContext({ logger: silent, tenantId: 't1' });
    const t2 = createContext({ logger: silent, tenantId: 't2' });
    await audit.log(t1, { actor: 'u1', action: 'a', resource: 'r', resourceId: '1', metadata: { b: 1, a: { d: 2, c: 3 } } });
    await audit.log(t2, { actor: 'u2', action: 'a', resource: 'r', resourceId: '1' });
    await audit.log(t1, { actor: 'u1', action: 'b', resource: 'r', resourceId: '1' });
    expect(log.entries[2]?.prevHash).toBe(log.entries[0]?.entryHash);
    expect((await audit.query(t1, {}, { page: 1, pageSize: 10 })).total).toBe(2);
    expect((await audit.query(t1, { tenantId: 't2' }, { page: 1, pageSize: 10 })).total).toBe(2);
    expect(await audit.findByResource(t2, 'r', '1')).toHaveLength(1);
    expect(await audit.verifyChain(t1)).toEqual({ ok: true, checked: 2 });
    log.entries[0]!.actor = 'someone-else';
    expect(await audit.verifyChain(t1)).toMatchObject({ ok: false, brokenAt: log.entries[0]!.id, reason: 'hash-mismatch' });
  });

  it('canonical form ignores key order', () => {
    const base = { actor: 'u', action: 'a', resource: 'r', resourceId: '1', occurredAt: 'x' };
    expect(auditCanonical({ ...base, metadata: { a: 1, b: { c: 1, d: 2 } } })).toBe(auditCanonical({ ...base, metadata: { b: { d: 2, c: 1 }, a: 1 } }));
  });

  it('writes inline when the enqueue fails', async () => {
    const written: string[] = [];
    const repository = {
      async create(_ctx: unknown, data: { action: string }) { written.push(data.action); return data; },
    };
    const logger = new RepositoryAuditLogger(repository as never, async () => { throw new Error('queue down'); });
    await logger.log(createContext({ logger: silent }), { actor: 'u', action: 'delete', resource: 'user', resourceId: '1' });
    expect(written).toEqual(['delete']);
  });
});

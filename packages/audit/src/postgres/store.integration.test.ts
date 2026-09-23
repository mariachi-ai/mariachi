import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createContext } from '@mariachi/core';
import { applySchema, createPostgresDatabase, type PostgresDatabase } from '@mariachi/database-postgres';
import { startPostgres, stopAll } from '../../../../test/setup';
import { auditLogsTable } from '../schema/index';
import { DrizzleAuditLog, installAuditAppendOnly } from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };
const run = crypto.randomUUID().slice(0, 8);
const tenant = `t-${run}`;
const ctx = createContext({ logger: silent, tenantId: tenant });
let database: PostgresDatabase;
let audit: DrizzleAuditLog;

beforeAll(async () => {
  database = createPostgresDatabase({ url: await startPostgres() });
  await database.connect();
  await applySchema(database.db, [auditLogsTable]);
  await installAuditAppendOnly(database.db);
  await installAuditAppendOnly(database.db); // idempotent
  audit = new DrizzleAuditLog(database.db);
}, 180_000);

afterAll(async () => {
  await database?.disconnect();
  await stopAll();
});

describe('DrizzleAuditLog', () => {
  it('keeps one linear chain across concurrent writers and instances', async () => {
    const other = new DrizzleAuditLog(database.db); // a second "instance"
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? audit : other).log(ctx, { actor: 'u1', action: `a${i}`, resource: 'doc', resourceId: '1', metadata: { z: i, a: [1, { y: 2, x: 1 }] } }),
      ),
    );
    expect(await audit.verifyChain(ctx)).toEqual({ ok: true, checked: 20 });
    const seqs = await database.db.execute(sql`select chain_seq from audit_logs where tenant_id = ${tenant} order by chain_seq`);
    expect([...seqs].map((r) => Number(r.chain_seq))).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('rejects UPDATE and DELETE at the database', async () => {
    await expect(database.db.execute(sql`update audit_logs set actor = 'x' where tenant_id = ${tenant}`)).rejects.toThrow(/append-only/);
    await expect(database.db.execute(sql`delete from audit_logs where tenant_id = ${tenant}`)).rejects.toThrow(/append-only/);
  });

  it('detects tampering by someone who bypasses the trigger', async () => {
    const t = createContext({ logger: silent, tenantId: `${tenant}-x` });
    await audit.log(t, { actor: 'u', action: 'a', resource: 'r', resourceId: '1' });
    await audit.log(t, { actor: 'u', action: 'b', resource: 'r', resourceId: '1' });
    await database.db.transaction(async (tx) => {
      await tx.execute(sql`alter table audit_logs disable trigger audit_logs_append_only`);
      await tx.execute(sql`update audit_logs set action = 'forged' where tenant_id = ${`${tenant}-x`} and action = 'a'`);
      await tx.execute(sql`alter table audit_logs enable trigger audit_logs_append_only`);
    });
    expect(await audit.verifyChain(t)).toMatchObject({ ok: false, reason: 'hash-mismatch' });
  });

  it('scopes queries to the tenant and exports JSON Lines', async () => {
    const page = await audit.find(ctx, { tenantId: `${tenant}-x` }, { page: 1, pageSize: 5 });
    expect(page.total).toBe(20);
    expect(page.data).toHaveLength(5);
    expect(page.data.every((e) => e.tenantId === tenant)).toBe(true);
    const lines = (await audit.export(ctx, { action: 'a3' })).split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ action: 'a3', tenantId: tenant });
    expect(await audit.findByResource(ctx, 'doc', '1')).toHaveLength(20);
  });

  it('retention deletes old entries and the rest still verifies', async () => {
    const t = createContext({ logger: silent, tenantId: `${tenant}-r` });
    for (const action of ['old1', 'old2']) await audit.log(t, { actor: 'u', action, resource: 'r', resourceId: '1' });
    await new Promise((r) => setTimeout(r, 20));
    const cutoff = new Date();
    for (const action of ['new1', 'new2']) await audit.log(t, { actor: 'u', action, resource: 'r', resourceId: '1' });
    expect(await audit.retain(t, cutoff)).toBe(2);
    expect((await audit.find(t, {}, { page: 1, pageSize: 10 })).data.map((e) => e.action).sort()).toEqual(['new1', 'new2']);
    expect(await audit.verifyChain(t)).toEqual({ ok: true, checked: 2 });
    await audit.log(t, { actor: 'u', action: 'new3', resource: 'r', resourceId: '1' });
    expect(await audit.verifyChain(t)).toEqual({ ok: true, checked: 3 });
  });
});

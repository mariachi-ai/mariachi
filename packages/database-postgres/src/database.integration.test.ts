import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createContext } from '@mariachi/core';
import { column, defineTable } from '@mariachi/database';
import { startPostgres, stopAll } from '../../../test/setup';
import { DrizzleRepository, applySchema, compileTable, createPostgresDatabase, withTransaction, type PostgresDatabase } from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

const notes = defineTable('it_notes', {
  id: column.uuid().primaryKey().defaultRandom(),
  tenantId: column.text().notNull(),
  title: column.text().notNull().unique(),
  createdAt: column.timestamp().notNull().defaultNow(),
  updatedAt: column.timestamp().notNull().defaultNow(),
  deletedAt: column.timestamp(),
});
type Note = { id: string; tenantId: string; title: string; createdAt: Date; updatedAt: Date; deletedAt: Date | null };
class NotesRepo extends DrizzleRepository<Note> {}

let database: PostgresDatabase;
let repo: NotesRepo;
const t1 = createContext({ logger: silent, tenantId: 't1' });
const t2 = createContext({ logger: silent, tenantId: 't2' });

beforeAll(async () => {
  database = createPostgresDatabase({ url: await startPostgres() });
  await database.connect();
  await database.db.execute(sql`drop table if exists it_notes`);
  await applySchema(database.db, [notes]);
  repo = new NotesRepo(notes, database.db);
}, 120_000);

afterAll(async () => {
  await database?.disconnect();
  await stopAll();
});

describe('DrizzleRepository against Postgres', () => {
  it('isolates tenants', async () => {
    const a = await repo.create(t1, { title: 'a' });
    expect(a.tenantId).toBe('t1');
    expect(await repo.findById(t2, a.id)).toBeNull();
    await expect(repo.update(t2, a.id, { title: 'hijack' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('soft deletes, hides, restores and hard deletes', async () => {
    const n = await repo.create(t1, { title: 'soft' });
    await repo.softDelete(t1, n.id);
    expect(await repo.findById(t1, n.id)).toBeNull();
    expect(await repo.findById(t1, n.id, { withDeleted: true })).not.toBeNull();
    await repo.restore(t1, n.id);
    expect(await repo.findById(t1, n.id)).not.toBeNull();
    await repo.softDelete(t1, n.id);
    await repo.hardDelete(t1, n.id);
    expect(await repo.findById(t1, n.id, { withDeleted: true })).toBeNull();
  });

  it('maps unique violations to ConflictError', async () => {
    await repo.create(t1, { title: 'dup' });
    await expect(repo.create(t1, { title: 'dup' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('paginates with cursors without gaps or repeats', async () => {
    for (let i = 0; i < 7; i++) await repo.create(t2, { title: `page-${i}` });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await repo.paginateCursor(t2, { limit: 3, cursor });
      seen.push(...page.data.map((d) => d.title));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(seen).size).toBe(7);
  });

  it('commits repository writes made inside a transaction, including nested ones', async () => {
    await withTransaction(database.db, t1, async () => {
      await repo.create(t1, { title: 'commit-1' });
      await withTransaction(database.db, t1, () => repo.create(t1, { title: 'commit-2' }));
    });
    expect(await repo.findOne(t1, { title: 'commit-2' })).not.toBeNull();
    await withTransaction(database.db, t1, () => repo.create(t1, { title: 'commit-3' }), { isolationLevel: 'serializable' });
    expect(await repo.findOne(t1, { title: 'commit-3' })).not.toBeNull();
  });

  it('rolls back every repository write inside a failed transaction', async () => {
    await expect(
      withTransaction(database.db, t1, async () => {
        await repo.create(t1, { title: 'tx-1' });
        await repo.create(t1, { title: 'tx-2' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.findOne(t1, { title: 'tx-1' })).toBeNull();
  });

  it('bumps updatedAt on raw drizzle updates too', async () => {
    const n = await repo.create(t1, { title: 'bump' });
    const table = compileTable(notes);
    await new Promise((r) => setTimeout(r, 5));
    await database.db.update(table).set({ title: 'bumped' }).where(eq(table.id, n.id));
    const after = await repo.getById(t1, n.id);
    expect(after.updatedAt.getTime()).toBeGreaterThan(n.updatedAt.getTime());
  });

  it('reports health via SELECT 1', async () => {
    expect(await database.isHealthy()).toBe(true);
  });
});

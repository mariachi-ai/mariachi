import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { column, defineTable, index } from '@mariachi/database';
import { planMigration, writeMigration } from './migrations';

const v1 = {
  notes: defineTable('cli_notes', {
    id: column.uuid().primaryKey().defaultRandom(),
    tenantId: column.text().notNull(),
    title: column.text().notNull(),
  }),
};

const v2 = {
  notes: defineTable(
    'cli_notes',
    {
      id: column.uuid().primaryKey().defaultRandom(),
      tenantId: column.text().notNull(),
      title: column.text().notNull(),
      status: column.enum(['draft', 'published'], { enumName: 'cli_note_status' }).notNull().default('draft'),
    },
    { indexes: [index('cli_notes_tenant_title_uniq').on('tenantId', 'title').unique()] },
  ),
};

const v3 = {
  notes: defineTable('cli_notes', {
    id: column.uuid().primaryKey().defaultRandom(),
    tenantId: column.text().notNull(),
  }),
};

describe('migration writer', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mariachi-mig-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes drizzle-kit compatible migrations and diffs incrementally', async () => {
    const first = await writeMigration(dir, await planMigration(dir, v1), 'init', 1);
    expect(first).toMatch(/0000_init\.sql$/);
    expect(await readFile(first!, 'utf8')).toContain('CREATE TABLE "cli_notes"');

    expect((await planMigration(dir, v1)).statements).toEqual([]);

    const plan = await planMigration(dir, v2);
    const sql = plan.statements.join('\n');
    expect(sql).toContain('CREATE TYPE "public"."cli_note_status"');
    expect(sql).toContain('ADD COLUMN "status"');
    expect(sql).not.toContain('CREATE TABLE');
    // the composite (tenantId, title) index supersedes the automatic tenant index
    expect(sql).toContain('DROP INDEX "cli_notes_tenant_id_idx"');
    expect(plan.destructive).toEqual([]);
    await writeMigration(dir, plan, 'Add Status!', 2);

    const journal = JSON.parse(await readFile(join(dir, 'meta', '_journal.json'), 'utf8'));
    expect(journal.entries.map((e: { tag: string }) => e.tag)).toEqual(['0000_init', '0001_add_status']);
    expect((await readdir(join(dir, 'meta'))).sort()).toEqual(['0000_snapshot.json', '0001_snapshot.json', '_journal.json']);
    expect(await readFile(join(dir, '0001_add_status.sql'), 'utf8')).toContain('--> statement-breakpoint');
  });

  it('flags destructive changes', async () => {
    await writeMigration(dir, await planMigration(dir, v1), 'init');
    const plan = await planMigration(dir, v3);
    expect(plan.destructive.join('\n')).toMatch(/DROP COLUMN "title"/);
  });
});

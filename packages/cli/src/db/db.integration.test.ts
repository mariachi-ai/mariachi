import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, stopAll } from '../../../../test/setup';

const run = promisify(execFile);
const CLI = resolve(__dirname, '../../dist/index.js');
// Inside the package so the fixture resolves @mariachi/* from this package's node_modules.
const project = resolve(__dirname, '../../.e2e-project');
let url: string;

async function mariachi(...args: string[]) {
  return run(process.execPath, [CLI, ...args], { cwd: project, env: { ...process.env, DATABASE_URL: url } });
}

beforeAll(async () => {
  url = await startPostgres();
  await rm(project, { recursive: true, force: true });
  await mkdir(join(project, 'src', 'schema'), { recursive: true });
  await mkdir(join(project, 'src', 'seeds'), { recursive: true });
  await writeFile(
    join(project, 'src', 'schema', 'index.ts'),
    `import { column, defineTable } from '@mariachi/database';
export const widgets = defineTable('e2e_widgets', {
  id: column.uuid().primaryKey().defaultRandom(),
  tenantId: column.text().notNull(),
  name: column.text().notNull(),
  kind: column.enum(['a', 'b'], { enumName: 'e2e_widget_kind' }).notNull().default('a'),
  createdAt: column.timestamp().notNull().defaultNow(),
});
`,
  );
  await writeFile(
    join(project, 'src', 'seeds', 'index.ts'),
    `import { sql } from 'drizzle-orm';
import { defineSeed } from '@mariachi/database';
export const seeds = [
  defineSeed({ name: 'widgets', run: async (_ctx: unknown, db: any) => { await db.execute(sql\`insert into e2e_widgets (tenant_id, name) values ('t1', 'seeded')\`); } }),
];
`,
  );
}, 180_000);

afterAll(async () => {
  await rm(project, { recursive: true, force: true });
  await stopAll();
});

describe('mariachi db', () => {
  it('generates, checks, migrates and seeds', async () => {
    await expect(mariachi('db', 'check')).rejects.toMatchObject({ code: 1 });

    const gen = await mariachi('db', 'generate', '--name', 'init');
    expect(gen.stdout).toMatch(/Wrote .*0000_init\.sql/);

    const check = await mariachi('db', 'check');
    expect(check.stdout).toMatch(/up to date/);

    await mariachi('db', 'migrate');
    await mariachi('db', 'migrate');
    await mariachi('db', 'seed');
    await mariachi('db', 'seed');

    const sql = postgres(url, { max: 1 });
    try {
      const rows = await sql`select name, kind from e2e_widgets`;
      expect(rows).toEqual([{ name: 'seeded', kind: 'a' }]);
    } finally {
      await sql.end();
    }
  }, 120_000);
});

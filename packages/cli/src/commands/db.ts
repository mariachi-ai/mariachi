import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { Command } from 'commander';
import { createJiti } from 'jiti';
import { readEnv } from '@mariachi/config';
import { ConfigError, createContext, type Logger } from '@mariachi/core';
import {
  PostgresAdapter,
  runMigrations,
  runSeeds,
  schemaSql,
  toDrizzleImports,
  type DrizzleDb,
} from '@mariachi/database-postgres';
import type { SeedDefinition } from '@mariachi/database';
import { drizzleConfigSource, planMigration, schemaShimSource, writeMigration } from '../db/migrations';

import { DIM, GREEN, RED, RESET, YELLOW } from '../colors';
import { fail } from '../output';

interface DbOptions {
  schema: string;
  out: string;
  url?: string;
}

const consoleLogger: Logger = {
  info: (obj: unknown, msg?: string) => console.log(msg ?? obj),
  warn: (obj: unknown, msg?: string) => console.warn(`${YELLOW}${msg ?? JSON.stringify(obj)}${RESET}`),
  error: (obj: unknown, msg?: string) => console.error(`${RED}${msg ?? JSON.stringify(obj)}${RESET}`),
  debug: () => {},
  child: () => consoleLogger,
} as unknown as Logger;

async function importModule(path: string): Promise<Record<string, unknown>> {
  const abs = resolve(path);
  if (!existsSync(abs)) throw new ConfigError('cli/file-not-found', `File not found: ${relative(process.cwd(), abs)}`);
  const jiti = createJiti(import.meta.url, { interopDefault: true });
  return (await jiti.import(abs)) as Record<string, unknown>;
}

function databaseUrl(options: DbOptions): string {
  const url = options.url ?? readEnv('DATABASE_URL');
  if (!url) throw new ConfigError('cli/missing-database-url', 'No database URL: pass --url or set DATABASE_URL');
  return url;
}

async function withAdapter<T>(options: DbOptions, fn: (adapter: PostgresAdapter) => Promise<T>): Promise<T> {
  const adapter = new PostgresAdapter({ adapter: 'postgres', url: databaseUrl(options), poolMax: 2, applicationName: 'mariachi-cli' });
  await adapter.connect();
  try {
    return await fn(adapter);
  } finally {
    await adapter.disconnect();
  }
}

function withSchemaOptions(cmd: Command): Command {
  return cmd
    .option('-s, --schema <path>', 'module exporting defineTable() tables', 'src/schema/index.ts')
    .option('-o, --out <dir>', 'migrations folder', 'drizzle');
}

export function registerDbCommand(program: Command): void {
  const db = program.command('db').description('Schema migrations and seeds (Postgres)');

  withSchemaOptions(db.command('generate'))
    .description('Diff the defineTable schema against the last migration and write a new one')
    .option('-n, --name <name>', 'migration name', 'migration')
    .option('--allow-destructive', 'write migrations that drop tables/columns without failing')
    .action(async (options: DbOptions & { name: string; allowDestructive?: boolean }) => {
      try {
        const schema = await importModule(options.schema);
        const plan = await planMigration(options.out, schema);
        if (plan.statements.length === 0) {
          console.log(`${GREEN}No schema changes.${RESET}`);
          return;
        }
        if (plan.destructive.length && !options.allowDestructive) {
          console.error(`${RED}Destructive changes detected:${RESET}`);
          for (const s of plan.destructive) console.error(`  ${s}`);
          console.error(
            '\nRenames show up as drop + add. Re-run with --allow-destructive, then edit the SQL (e.g. ALTER ... RENAME) before migrating.',
          );
          process.exit(1);
        }
        const file = await writeMigration(options.out, plan, options.name);
        console.log(`${GREEN}Wrote${RESET} ${file} ${DIM}(${plan.statements.length} statements)${RESET}`);

        const shimPath = join(options.out, 'meta', 'schema.ts');
        const schemaImport = relative(dirname(shimPath), resolve(options.schema)).replace(/\.ts$/, '');
        await writeFile(shimPath, schemaShimSource(schemaImport.startsWith('.') ? schemaImport : `./${schemaImport}`, Object.keys(toDrizzleImports(schema))));
        if (!existsSync('drizzle.config.ts')) {
          await writeFile('drizzle.config.ts', drizzleConfigSource({ out: `./${options.out}`, schemaShim: `./${shimPath}` }));
          console.log(`${GREEN}Wrote${RESET} drizzle.config.ts`);
        }
      } catch (err) {
        fail(err);
      }
    });

  withSchemaOptions(db.command('check'))
    .description('Exit non-zero if the schema has changes that are not captured in a migration (for CI)')
    .action(async (options: DbOptions) => {
      try {
        const plan = await planMigration(options.out, await importModule(options.schema));
        if (plan.statements.length) {
          console.error(`${RED}Schema drift:${RESET} ${plan.statements.length} statements missing. Run \`mariachi db generate\`.`);
          for (const s of plan.statements) console.error(`${DIM}  ${s.split('\n')[0]}${RESET}`);
          process.exit(1);
        }
        console.log(`${GREEN}Migrations are up to date with the schema.${RESET}`);
      } catch (err) {
        fail(err);
      }
    });

  withSchemaOptions(db.command('sql'))
    .description('Print the full DDL for the schema (no database needed)')
    .action(async (options: DbOptions) => {
      try {
        const statements = await schemaSql(await importModule(options.schema));
        console.log(statements.map((s) => `${s};`.replace(/;;$/, ';')).join('\n\n'));
      } catch (err) {
        fail(err);
      }
    });

  db.command('migrate')
    .description('Apply pending migrations (serialized with an advisory lock)')
    .option('-o, --out <dir>', 'migrations folder', 'drizzle')
    .option('--url <url>', 'database URL (default: DATABASE_URL)')
    .action(async (options: DbOptions) => {
      try {
        await withAdapter(options, (adapter) => runMigrations(adapter, { migrationsFolder: options.out, logger: consoleLogger }));
        console.log(`${GREEN}Migrations applied.${RESET}`);
      } catch (err) {
        fail(err);
      }
    });

  db.command('seed')
    .description('Run seeds exported from a module (defineSeed). Each seed runs once per environment unless --force')
    .option('-f, --file <path>', 'module exporting seeds', 'src/seeds/index.ts')
    .option('-e, --env <environment>', 'environment name', 'development')
    .option('--force', 're-run seeds that already ran')
    .option('--url <url>', 'database URL (default: DATABASE_URL)')
    .action(async (options: DbOptions & { file: string; env: string; force?: boolean }) => {
      try {
        const mod = await importModule(options.file);
        const seeds = (Array.isArray(mod.seeds) ? mod.seeds : Array.isArray(mod.default) ? mod.default : Object.values(mod)).filter(
          (s): s is SeedDefinition<DrizzleDb> => !!s && typeof s === 'object' && 'name' in s && 'run' in s,
        );
        if (seeds.length === 0) throw new ConfigError('cli/no-seeds', `${options.file} exports no seeds (use defineSeed)`);
        await withAdapter(options, (adapter) =>
          runSeeds(adapter.getClient<DrizzleDb>(), seeds, {
            environment: options.env,
            force: options.force,
            logger: consoleLogger,
            ctx: createContext({ logger: consoleLogger, identityType: 'system' }),
          }),
        );
        console.log(`${GREEN}Seeds complete.${RESET}`);
      } catch (err) {
        fail(err);
      }
    });

  db.command('init')
    .description('Create a schema module and migrations folder')
    .option('-s, --schema <path>', 'schema module path', 'src/schema/index.ts')
    .action(async (options: { schema: string }) => {
      if (existsSync(options.schema)) {
        console.log(`${DIM}${options.schema} already exists${RESET}`);
        return;
      }
      await mkdir(dirname(options.schema), { recursive: true });
      await writeFile(
        options.schema,
        `import { column, defineTable } from '@mariachi/database';\n\nexport { usersTable, tenantsTable } from '@mariachi/database';\n\nexport const notesTable = defineTable('notes', {\n  id: column.uuid().primaryKey().defaultRandom(),\n  tenantId: column.text().notNull(),\n  title: column.text().notNull(),\n  createdAt: column.timestamp().notNull().defaultNow(),\n  updatedAt: column.timestamp().notNull().defaultNow(),\n  deletedAt: column.timestamp(),\n});\n`,
      );
      console.log(`${GREEN}Wrote${RESET} ${options.schema}. Next: mariachi db generate --name init`);
    });
}

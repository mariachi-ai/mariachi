import { createRequire } from 'node:module';
import { is, sql } from 'drizzle-orm';
import { PgTable, getTableConfig, isPgEnum } from 'drizzle-orm/pg-core';
import { ConfigError } from '@mariachi/core';
import type { TableDefinition } from '@mariachi/database';
import { compileTable } from './compiler';
import type { DrizzleDb } from './transaction';

type SchemaInput = Array<TableDefinition | PgTable> | Record<string, unknown>;

type DrizzleKitApi = {
  generateDrizzleJson: (imports: Record<string, unknown>) => unknown;
  generateMigration: (prev: unknown, cur: unknown) => Promise<string[]>;
};

function loadKit(): DrizzleKitApi {
  try {
    // drizzle-kit's ESM api build does dynamic `require('fs')`; its CJS build works everywhere.
    return createRequire(import.meta.url)('drizzle-kit/api') as DrizzleKitApi;
  } catch {
    throw new ConfigError('database/missing-dependency', 'Schema generation requires drizzle-kit: pnpm add -D drizzle-kit');
  }
}

function isTableDefinition(value: unknown): value is TableDefinition {
  return !!value && typeof value === 'object' && 'columns' in value && 'tableName' in value;
}

/**
 * Normalizes DSL tables / pgTables / module namespaces into a drizzle-kit import
 * map, including only the enums those tables use.
 */
export function toDrizzleImports(input: SchemaInput): Record<string, unknown> {
  const entries = Array.isArray(input) ? input.map((t, i) => [`t${i}`, t] as const) : Object.entries(input);
  const out: Record<string, unknown> = {};
  for (const [name, value] of entries) {
    if (isPgEnum(value)) out[name] = value;
    else if (is(value, PgTable)) out[name] = value;
    else if (isTableDefinition(value)) out[name] = compileTable(value);
  }
  for (const value of Object.values(out)) {
    if (!is(value, PgTable)) continue;
    for (const col of getTableConfig(value).columns) {
      const e = (col as { enum?: unknown }).enum;
      if (isPgEnum(e)) out[`__enum_${e.enumName}`] = e;
    }
  }
  return out;
}

/**
 * DDL that creates `tables` from an empty database, in dependency order (enums,
 * tables, foreign keys, indexes). Used by `mariachi db generate --sql` and by
 * integration tests.
 */
export async function schemaSql(tables: SchemaInput): Promise<string[]> {
  const kit = loadKit();
  const empty = kit.generateDrizzleJson({});
  const current = kit.generateDrizzleJson(toDrizzleImports(tables));
  return kit.generateMigration(empty, current);
}

/** Creates `tables` in a fresh database. Intended for tests; production uses migrations. */
export async function applySchema(db: DrizzleDb, tables: SchemaInput): Promise<void> {
  for (const statement of await schemaSql(tables)) {
    await db.execute(sql.raw(statement));
  }
}

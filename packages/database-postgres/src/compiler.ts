import { sql } from 'drizzle-orm';
import type { TableDefinition, ColumnDefinition } from '@mariachi/database';
import { camelToSnake } from '@mariachi/database';
import { ConfigError } from '@mariachi/core';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  doublePrecision,
  index,
  uniqueIndex,
  check,
  primaryKey,
  type PgTableWithColumns,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const compiledTables = new WeakMap<TableDefinition, PgTableWithColumns<any>>();
const enums = new Map<string, ReturnType<typeof pgEnum>>();

/** Every pgEnum created by the compiler; export these from your drizzle-kit schema file. */
export function compiledEnums(): Record<string, ReturnType<typeof pgEnum>> {
  return Object.fromEntries(enums);
}

function enumFor(def: TableDefinition, key: string, col: ColumnDefinition) {
  const name = col.enumName ?? `${def.tableName}_${col.name ?? camelToSnake(key)}`;
  const values = col.enumValues as [string, ...string[]] | undefined;
  if (!values?.length) throw new ConfigError('database/invalid-enum', `Enum column ${def.tableName}.${key} has no values`);
  const existing = enums.get(name);
  if (existing) {
    if (existing.enumValues.join(',') !== values.join(',')) {
      throw new ConfigError('database/enum-conflict', `Enum ${name} is declared with different values`);
    }
    return existing;
  }
  const e = pgEnum(name, values);
  enums.set(name, e);
  return e;
}

function compilePgColumn(def: TableDefinition, key: string, col: ColumnDefinition) {
  const dbName = col.name ?? camelToSnake(key);
  let builder: any;
  switch (col.type) {
    case 'uuid':
      builder = uuid(dbName);
      break;
    case 'text':
      builder = text(dbName);
      break;
    case 'varchar':
      builder = varchar(dbName, { length: col.length ?? 255 });
      break;
    case 'integer':
      builder = integer(dbName);
      break;
    case 'bigint':
      builder = bigint(dbName, { mode: 'number' });
      break;
    case 'double':
      builder = doublePrecision(dbName);
      break;
    case 'boolean':
      builder = boolean(dbName);
      break;
    case 'timestamp':
      builder = timestamp(dbName, { withTimezone: col.withTimezone ?? true, mode: 'date' });
      break;
    case 'date':
      builder = date(dbName, { mode: 'string' });
      break;
    case 'json':
      builder = jsonb(dbName);
      break;
    case 'numeric':
      builder = col.precision != null && col.scale != null ? numeric(dbName, { precision: col.precision, scale: col.scale }) : numeric(dbName);
      break;
    case 'enum':
      builder = enumFor(def, key, col)(dbName);
      break;
    default:
      throw new ConfigError('database/unknown-column-type', `Unknown column type: ${(col as ColumnDefinition).type}`);
  }

  if (col.primaryKey) builder = builder.primaryKey();
  if (col.notNull) builder = builder.notNull();
  if (col.unique) builder = builder.unique();

  if (col.default) {
    switch (col.default.kind) {
      case 'random':
        builder = builder.defaultRandom();
        break;
      case 'now':
        builder = builder.defaultNow();
        break;
      case 'value':
        builder = builder.default(col.default.value);
        break;
      case 'sql':
        builder = builder.default(sql.raw(String(col.default.value)));
        break;
    }
  }

  if (col.onUpdateNow) builder = builder.$onUpdate(() => new Date());

  if (col.references) {
    const ref = col.references;
    builder = builder.references(
      (): AnyPgColumn => {
        const target = compileTable(ref.table());
        const column = (target as unknown as Record<string, AnyPgColumn>)[ref.column];
        if (!column) throw new ConfigError('database/invalid-reference', `${def.tableName}.${key} references unknown column ${ref.column}`);
        return column;
      },
      { onDelete: ref.onDelete, onUpdate: ref.onUpdate },
    );
  }
  return builder;
}

/** Compiles a DSL table into a Drizzle pgTable (memoized, so references resolve to one instance). */
export function compileTable<T extends TableDefinition>(def: T): PgTableWithColumns<any> {
  const cached = compiledTables.get(def);
  if (cached) return cached;
  const columns: Record<string, any> = {};
  for (const [key, col] of Object.entries(def.columns)) columns[key] = compilePgColumn(def, key, col);

  const table = pgTable(def.tableName, columns, (t: Record<string, any>) => {
    const extras: any[] = [];
    for (const idx of def.indexes ?? []) {
      const cols = idx.columns.map((c) => t[c]);
      let built = (idx.unique ? uniqueIndex(idx.name) : index(idx.name)).on(cols[0], ...cols.slice(1));
      if (idx.where) built = built.where(sql.raw(idx.where));
      extras.push(built);
    }
    for (const c of def.checks ?? []) extras.push(check(c.name, sql.raw(c.sql)));
    if (def.primaryKey?.length) extras.push(primaryKey({ columns: def.primaryKey.map((c) => t[c]) as [any, ...any[]] }));
    return extras;
  });
  compiledTables.set(def, table);
  return table;
}

/**
 * Compiles a set of DSL tables for drizzle-kit. Export the result (and `compiledEnums()`) from
 * the schema file referenced by drizzle.config.ts.
 */
export function compileSchema<T extends Record<string, TableDefinition>>(tables: T): { [K in keyof T]: PgTableWithColumns<any> } {
  const out: Record<string, PgTableWithColumns<any>> = {};
  for (const [name, def] of Object.entries(tables)) out[name] = compileTable(def);
  return out as { [K in keyof T]: PgTableWithColumns<any> };
}

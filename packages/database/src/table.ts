import { ConfigError } from '@mariachi/core';
import type { ColumnBuilder } from './column';
import type { ColumnDefinition, ColumnType, IndexDefinition, TableDefinition, TableOptions } from './schema';

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

type ResolveColumns<T extends Record<string, ColumnBuilder<any, any, any>>> = {
  [K in keyof T]: T[K] extends ColumnBuilder<infer TType, infer TNotNull, infer TData>
    ? ColumnDefinition<TType, TNotNull, TData>
    : ColumnDefinition;
};

type IndexInput = IndexDefinition | { build(): IndexDefinition };

export interface DefineTableOptions extends Omit<TableOptions, 'indexes'> {
  indexes?: IndexInput[];
}

/**
 * Declares a table in the driver-agnostic DSL. Tables with a `tenantId` column are tenant-scoped
 * and tables with `deletedAt` soft-delete by default; repositories enforce both.
 */
export function defineTable<T extends Record<string, ColumnBuilder<ColumnType, boolean, any>>>(
  tableName: string,
  columns: T,
  options: DefineTableOptions = {},
): TableDefinition<ResolveColumns<T>> {
  const resolved: Record<string, ColumnDefinition> = {};
  const indexes: IndexDefinition[] = [];
  for (const [key, builder] of Object.entries(columns)) {
    const def = { ...builder._def } as ColumnDefinition;
    if (!def.name) def.name = camelToSnake(key);
    if (key === 'updatedAt' && def.type === 'timestamp' && def.onUpdateNow === undefined) def.onUpdateNow = true;
    resolved[key] = def;
    if (def.index) indexes.push({ name: `${tableName}_${def.name}_idx`, columns: [key], unique: false });
  }
  for (const idx of options.indexes ?? []) {
    const built = 'build' in idx ? idx.build() : idx;
    for (const c of built.columns) {
      if (!(c in resolved)) throw new ConfigError('database/invalid-index', `Index ${built.name} references unknown column ${c}`);
    }
    indexes.push(built);
  }
  for (const c of options.primaryKey ?? []) {
    if (!(c in resolved)) throw new ConfigError('database/invalid-pk', `Primary key references unknown column ${c}`);
  }

  const tenantColumn = options.tenantColumn === false ? undefined : (options.tenantColumn ?? ('tenantId' in resolved ? 'tenantId' : undefined));
  const softDeleteColumn =
    options.softDeleteColumn === false ? undefined : (options.softDeleteColumn ?? ('deletedAt' in resolved ? 'deletedAt' : undefined));

  if (tenantColumn && !indexes.some((i) => i.columns[0] === tenantColumn) && !resolved[tenantColumn]?.primaryKey) {
    indexes.push({ name: `${tableName}_${resolved[tenantColumn].name}_idx`, columns: [tenantColumn], unique: false });
  }

  return {
    tableName,
    columns: resolved,
    indexes,
    checks: options.checks ?? [],
    primaryKey: options.primaryKey,
    tenantColumn,
    softDeleteColumn,
  } as TableDefinition<ResolveColumns<T>>;
}

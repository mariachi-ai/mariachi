import type { ColumnBuilder } from './column';
import type { ColumnDefinition, ColumnType, TableDefinition } from './schema';

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

type ResolveColumns<T extends Record<string, ColumnBuilder<any, any>>> = {
  [K in keyof T]: T[K] extends ColumnBuilder<infer TType, infer TNotNull>
    ? ColumnDefinition<TType, TNotNull>
    : ColumnDefinition;
};

export function defineTable<T extends Record<string, ColumnBuilder<ColumnType, boolean>>>(
  tableName: string,
  columns: T,
): TableDefinition<ResolveColumns<T>> {
  const resolved: Record<string, ColumnDefinition> = {};
  for (const [key, builder] of Object.entries(columns)) {
    const def = { ...builder._def };
    if (!def.name) {
      def.name = camelToSnake(key);
    }
    resolved[key] = def;
  }
  return { tableName, columns: resolved } as TableDefinition<ResolveColumns<T>>;
}

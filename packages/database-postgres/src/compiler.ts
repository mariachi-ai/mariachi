import type { TableDefinition, ColumnDefinition } from '@mariachi/database';
import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, numeric } from 'drizzle-orm/pg-core';

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function compilePgColumn(key: string, col: ColumnDefinition) {
  const dbName = col.name ?? camelToSnake(key);

  let builder: any;
  switch (col.type) {
    case 'uuid':
      builder = uuid(dbName);
      break;
    case 'text':
      builder = text(dbName);
      break;
    case 'integer':
      builder = integer(dbName);
      break;
    case 'boolean':
      builder = boolean(dbName);
      break;
    case 'timestamp':
      builder = timestamp(dbName);
      break;
    case 'json':
      builder = jsonb(dbName);
      break;
    case 'numeric':
      if (col.precision != null && col.scale != null) {
        builder = numeric(dbName, { precision: col.precision, scale: col.scale });
      } else {
        builder = numeric(dbName);
      }
      break;
    default:
      throw new Error(`Unknown column type: ${col.type}`);
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
    }
  }

  return builder;
}

export function compileTable(def: TableDefinition) {
  const columns: Record<string, any> = {};
  for (const [key, col] of Object.entries(def.columns)) {
    columns[key] = compilePgColumn(key, col);
  }
  return pgTable(def.tableName, columns);
}

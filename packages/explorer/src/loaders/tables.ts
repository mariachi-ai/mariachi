import fs from 'node:fs';
import type { ColumnDefinition, TableDefinition } from '@mariachi/database';
import { type TableEntry, tableEntry, validate } from '../data/schema';
import { importWorkspace } from '../lib/node-import';
import { fromRoot, once } from '../lib/repo';

function describeDefault(def: ColumnDefinition['default']): string | null {
  if (!def) return null;
  if (def.kind === 'now') return 'now()';
  if (def.kind === 'random') return 'gen_random_uuid()';
  return typeof def.value === 'string' ? def.value : JSON.stringify(def.value);
}

function describeReference(ref: ColumnDefinition['references']): string | null {
  if (!ref) return null;
  try {
    return `${ref.table().tableName}.${ref.column}${ref.onDelete ? ` (on delete ${ref.onDelete})` : ''}`;
  } catch {
    return ref.column;
  }
}

/** Export name → owning package, from `export { … } from '@mariachi/<pkg>/schema'` lines. */
function owners(): Map<string, string> {
  const src = fs.readFileSync(fromRoot('packages/schema/src/index.ts'), 'utf8');
  const map = new Map<string, string>();
  for (const m of src.matchAll(/export\s*\{([^}]+)\}\s*from\s*'(@mariachi\/[^/']+)/g)) {
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) map.set(name, m[2]);
  }
  return map;
}

/** Every framework table from `@mariachi/schema`, with columns, indexes and the owning package. */
export const loadTables = once(async (): Promise<TableEntry[]> => {
  const schema = await importWorkspace<Record<string, unknown>>('@mariachi/schema');
  const owner = owners();
  return Object.entries(schema)
    .filter((entry): entry is [string, TableDefinition] => typeof entry[1] === 'object' && entry[1] !== null && 'tableName' in entry[1])
    .map(([exportName, t]) =>
      validate(
        tableEntry,
        {
          exportName,
          tableName: t.tableName,
          package: owner.get(exportName) ?? '@mariachi/schema',
          columns: Object.entries(t.columns).map(([key, c]) => ({
            key,
            name: c.name ?? key,
            type: c.type === 'enum' && c.enumValues ? `enum(${c.enumValues.join(', ')})` : c.type,
            notNull: c.notNull,
            unique: c.unique,
            primaryKey: c.primaryKey || (t.primaryKey ?? []).includes(key),
            default: describeDefault(c.default),
            references: describeReference(c.references),
          })),
          indexes: t.indexes.map((i) => ({ name: i.name, columns: i.columns, unique: i.unique })),
          primaryKey: t.primaryKey ?? Object.entries(t.columns).filter(([, c]) => c.primaryKey).map(([k]) => k),
          tenantColumn: t.tenantColumn ?? null,
          softDeleteColumn: t.softDeleteColumn ?? null,
        },
        `@mariachi/schema ${exportName}`,
      ),
    )
    .sort((a, b) => a.package.localeCompare(b.package) || a.tableName.localeCompare(b.tableName));
});

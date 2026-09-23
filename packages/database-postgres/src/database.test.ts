import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { createContext } from '@mariachi/core';
import { column, defineTable, index } from '@mariachi/database';
import { DrizzleRepository, compileTable, mapPgError, schemaSql } from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

const orgs = defineTable('orgs', {
  id: column.uuid().primaryKey().defaultRandom(),
  name: column.text().notNull(),
});

const projects = defineTable(
  'projects',
  {
    id: column.uuid().primaryKey().defaultRandom(),
    tenantId: column.text().notNull(),
    orgId: column.uuid().notNull().references(() => orgs, 'id', { onDelete: 'cascade' }),
    slug: column.text().notNull(),
    status: column.enum(['draft', 'live']).notNull().default('draft'),
    createdAt: column.timestamp().notNull().defaultNow(),
    updatedAt: column.timestamp().notNull().defaultNow(),
    deletedAt: column.timestamp(),
  },
  { indexes: [index('projects_tenant_slug_uniq').on('tenantId', 'slug').unique().where('deleted_at IS NULL')] },
);

type Project = { id: string; tenantId: string; orgId: string; slug: string; status: 'draft' | 'live'; createdAt: Date; updatedAt: Date; deletedAt: Date | null };

class ProjectsRepo extends DrizzleRepository<Project> {}

const db = drizzle({ client: postgres('postgres://127.0.0.1:1/none', { max: 1 }) });

describe('database-postgres compiler', () => {
  it('compiles indexes, tenant index, foreign keys and enums', () => {
    const cfg = getTableConfig(compileTable(projects));
    const names = cfg.indexes.map((i) => i.config.name);
    expect(names).toContain('projects_tenant_slug_uniq');
    // the composite index leads with tenantId, so no separate tenant index is added
    expect(names).not.toContain('projects_tenant_id_idx');
    expect(getTableConfig(compileTable(defineTable('t_only', { id: column.uuid().primaryKey(), tenantId: column.text().notNull() }))).indexes.map((i) => i.config.name)).toEqual(['t_only_tenant_id_idx']);
    expect(cfg.foreignKeys).toHaveLength(1);
    expect(cfg.foreignKeys[0].onDelete).toBe('cascade');
    expect(cfg.columns.find((c) => c.name === 'status')?.columnType).toBe('PgEnumColumn');
  });

  it('generates DDL with enums, partial unique indexes and foreign keys', async () => {
    const ddl = (await schemaSql([orgs, projects])).join('\n');
    expect(ddl).toMatch(/CREATE TYPE "public"\."projects_status" AS ENUM\('draft', 'live'\)/);
    expect(ddl).toMatch(/CREATE UNIQUE INDEX "projects_tenant_slug_uniq".*WHERE deleted_at IS NULL/);
    expect(ddl).toMatch(/FOREIGN KEY \("org_id"\) REFERENCES "public"\."orgs"\("id"\) ON DELETE cascade/);
  });

  it('memoizes compiled tables', () => {
    expect(compileTable(projects)).toBe(compileTable(projects));
  });
});

describe('DrizzleRepository guards', () => {
  const repo = new ProjectsRepo(projects, db);

  it('fails closed without a tenant on tenant-scoped tables', async () => {
    await expect(repo.findMany(createContext({ logger: silent }))).rejects.toMatchObject({ code: 'database/tenant-required' });
    await expect(repo.create(createContext({ logger: silent }), { slug: 'x' })).rejects.toMatchObject({ code: 'database/tenant-required' });
  });

  it('refuses to insert rows for another tenant', async () => {
    const ctx = createContext({ logger: silent, tenantId: 't1' });
    await expect(repo.create(ctx, { tenantId: 't2', slug: 'x' })).rejects.toMatchObject({ code: 'database/tenant-mismatch' });
  });

  it('rejects unknown filter fields instead of ignoring them', async () => {
    const ctx = createContext({ logger: silent, tenantId: 't1' });
    await expect(repo.findMany(ctx, { nope: 1 } as never)).rejects.toMatchObject({ code: 'validation/invalid-input' });
  });

  it('refuses unfiltered bulk deletes', async () => {
    const ctx = createContext({ logger: silent, tenantId: 't1' });
    await expect(repo.deleteWhere(ctx, {})).rejects.toMatchObject({ code: 'database/unsafe-operation' });
  });
});

describe('mapPgError', () => {
  it('maps SQLSTATE codes to typed errors', () => {
    expect(mapPgError({ code: '23505', constraint_name: 'x' }, 'create').code).toBe('conflict');
    expect(mapPgError({ code: '23503' }, 'create').code).toBe('database/foreign-key-violation');
    expect(mapPgError({ code: '40001' }, 'tx').code).toBe('database/serialization-failure');
  });
});

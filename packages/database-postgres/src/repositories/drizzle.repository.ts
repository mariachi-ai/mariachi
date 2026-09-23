import type {
  Context,
  CursorPaginatedResult,
  CursorPaginationParams,
  Entity,
  PaginatedResult,
  PaginationParams,
  SortParams,
} from '@mariachi/core';
import { DatabaseError, NotFoundError, ValidationError } from '@mariachi/core';
import type { FilterCondition, FindOptions, QueryFilter, Repository, TableDefinition } from '@mariachi/database';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  getTableName,
  gt,
  gte,
  ilike,
  inArray,
  is,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { PgTable, type AnyPgColumn, type PgTableWithColumns } from 'drizzle-orm/pg-core';
import { compileTable } from '../compiler';
import { mapPgError } from '../errors';
import { currentTransaction, type DrizzleDb } from '../transaction';

export interface DrizzleRepositoryOptions {
  /** Column key scoping rows to a tenant. Defaults to the table definition's `tenantColumn`. */
  tenantColumn?: string | false;
  /** Column key for soft deletes. Defaults to the table definition's `softDeleteColumn`. */
  softDeleteColumn?: string | false;
  /** Maximum `limit` accepted by paginate/findMany. Default 500. */
  maxPageSize?: number;
}

const MAX_PAGE = 500;

function encodeCursor(value: string, id: string): string {
  return Buffer.from(JSON.stringify({ v: value, id })).toString('base64url');
}

function decodeCursor(cursor: string): { value: string; id: string } {
  const invalid = () => new ValidationError('Invalid cursor', [{ path: ['cursor'], message: 'Malformed cursor' }]);
  let parsed: { v?: unknown; id?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalid();
  }
  if (typeof parsed.id !== 'string' || typeof parsed.v !== 'string') throw invalid();
  return { value: parsed.v, id: parsed.id };
}

/**
 * Tenant-safe, soft-delete-aware repository over a Drizzle table.
 *
 * - Tenant-scoped tables require `ctx.tenantId`; queries without it throw `database/tenant-required`.
 *   Use `this.crossTenant()` in services that legitimately operate across tenants (admin, jobs).
 * - Reads exclude soft-deleted rows unless `withDeleted` is set; `hardDelete` bypasses that filter.
 * - Unknown filter/sort fields throw instead of being ignored.
 * - Calls inside `withTransaction` automatically use the transaction.
 */
export abstract class DrizzleRepository<T extends Entity> implements Repository<T> {
  protected readonly table: PgTableWithColumns<any>;
  protected readonly tenantColumn?: string;
  protected readonly softDeleteColumn?: string;
  private readonly baseDb: DrizzleDb;
  private readonly allowCrossTenant: boolean;

  constructor(
    table: PgTableWithColumns<any> | TableDefinition,
    db: DrizzleDb,
    protected readonly options: DrizzleRepositoryOptions = {},
    allowCrossTenant = false,
  ) {
    const def = is(table, PgTable) ? undefined : (table as TableDefinition);
    this.table = def ? compileTable(def) : (table as PgTableWithColumns<any>);
    this.baseDb = db;
    this.allowCrossTenant = allowCrossTenant;
    const cols = this.table as unknown as Record<string, unknown>;
    const pick = (opt: string | false | undefined, fromDef: string | undefined, fallback: string) => {
      if (opt === false) return undefined;
      if (opt) return opt;
      if (def) return fromDef;
      return fallback in cols ? fallback : undefined;
    };
    this.tenantColumn = pick(options.tenantColumn, def?.tenantColumn, 'tenantId');
    this.softDeleteColumn = pick(options.softDeleteColumn, def?.softDeleteColumn, 'deletedAt');
  }

  /** The active transaction if any, else the pool. */
  protected get db(): DrizzleDb {
    return (currentTransaction() as unknown as DrizzleDb) ?? this.baseDb;
  }

  /**
   * Returns a view of this repository that does not apply tenant scoping. Every use should be
   * deliberate (admin tooling, cross-tenant jobs); prefer passing a tenant-scoped ctx.
   */
  crossTenant(): this {
    const clone = Object.create(Object.getPrototypeOf(this)) as this;
    Object.assign(clone, this, { allowCrossTenant: true });
    return clone;
  }

  protected columns(): Record<string, AnyPgColumn> {
    return this.table as unknown as Record<string, AnyPgColumn>;
  }

  protected column(field: string): AnyPgColumn {
    const col = this.columns()[field];
    if (!col || typeof col !== 'object') {
      throw new ValidationError(`Unknown field "${field}"`, [{ path: [field], message: 'Unknown field' }]);
    }
    return col;
  }

  private tenantCondition(ctx: Context): SQL | undefined {
    if (!this.tenantColumn || this.allowCrossTenant) return undefined;
    if (!ctx.tenantId) {
      throw new DatabaseError('database/tenant-required', 'Query on tenant-scoped table requires ctx.tenantId');
    }
    return eq(this.column(this.tenantColumn), ctx.tenantId);
  }

  private condition(cond: FilterCondition): SQL {
    const col = this.column(cond.field);
    const v = cond.value as any;
    switch (cond.op) {
      case 'eq':
        return v === null ? isNull(col) : eq(col, v);
      case 'neq':
        return v === null ? isNotNull(col) : ne(col, v);
      case 'gt':
        return gt(col, v);
      case 'gte':
        return gte(col, v);
      case 'lt':
        return lt(col, v);
      case 'lte':
        return lte(col, v);
      case 'in':
        return Array.isArray(v) && v.length ? inArray(col, v) : sql`false`;
      case 'notIn':
        return Array.isArray(v) && v.length ? notInArray(col, v) : sql`true`;
      case 'like':
        return like(col, String(v));
      case 'ilike':
        return ilike(col, String(v));
      case 'isNull':
        return isNull(col);
      case 'isNotNull':
        return isNotNull(col);
      default:
        throw new ValidationError(`Unknown filter op ${(cond as FilterCondition).op}`);
    }
  }

  protected buildWhere(ctx: Context, filter?: QueryFilter<T>, options: { withDeleted?: boolean } = {}): SQL | undefined {
    const conditions: SQL[] = [];
    if (this.softDeleteColumn && !options.withDeleted) conditions.push(isNull(this.column(this.softDeleteColumn)));
    const tenant = this.tenantCondition(ctx);
    if (tenant) conditions.push(tenant);
    if (filter) {
      if (Array.isArray(filter)) {
        for (const cond of filter) conditions.push(this.condition(cond));
      } else {
        for (const [key, value] of Object.entries(filter)) {
          if (value === undefined) continue;
          conditions.push(value === null ? isNull(this.column(key)) : eq(this.column(key), value));
        }
      }
    }
    return conditions.length ? and(...conditions) : undefined;
  }

  protected buildOrderBy(sort?: SortParams | SortParams[]): SQL[] {
    if (!sort) return [];
    const list = Array.isArray(sort) ? sort : [sort];
    return list.map((s) => (s.direction === 'desc' ? desc(this.column(s.field)) : asc(this.column(s.field))));
  }

  private idWhere(ctx: Context, id: string, options: { withDeleted?: boolean } = {}): SQL {
    const where = this.buildWhere(ctx, undefined, options);
    const byId = eq(this.column('id'), id);
    return where ? (and(byId, where) as SQL) : byId;
  }

  private async run<R>(operation: string, fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (error) {
      throw mapPgError(error, operation);
    }
  }

  private prepareInsert(ctx: Context, data: Partial<T>): Record<string, unknown> {
    const row: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    if (this.tenantColumn && !this.allowCrossTenant) {
      if (!ctx.tenantId) throw new DatabaseError('database/tenant-required', 'Insert into tenant-scoped table requires ctx.tenantId');
      if (row[this.tenantColumn] !== undefined && row[this.tenantColumn] !== ctx.tenantId) {
        throw new DatabaseError('database/tenant-mismatch', 'Cannot insert a row for another tenant');
      }
      row[this.tenantColumn] = ctx.tenantId;
    }
    return row;
  }

  private preparePatch(data: Record<string, unknown>): Record<string, unknown> {
    const patch = Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'id' && key !== this.tenantColumn));
    if ('updatedAt' in this.columns() && patch.updatedAt === undefined) patch.updatedAt = new Date();
    return patch;
  }

  async findById(ctx: Context, id: string, options: Pick<FindOptions, 'withDeleted'> = {}): Promise<T | null> {
    return this.run('findById', async () => {
      const rows = await this.db.select().from(this.table).where(this.idWhere(ctx, id, options)).limit(1);
      return (rows[0] as T) ?? null;
    });
  }

  async getById(ctx: Context, id: string): Promise<T> {
    const row = await this.findById(ctx, id);
    if (!row) throw new NotFoundError(this.resourceName, id);
    return row;
  }

  protected get resourceName(): string {
    return getTableName(this.table);
  }

  async findOne(ctx: Context, filter: QueryFilter<T>): Promise<T | null> {
    const rows = await this.findMany(ctx, filter, { limit: 1 });
    return rows[0] ?? null;
  }

  async findMany(ctx: Context, filter?: QueryFilter<T>, sortOrOptions?: SortParams | FindOptions): Promise<T[]> {
    const options: FindOptions =
      sortOrOptions && 'field' in sortOrOptions ? { sort: sortOrOptions as SortParams } : ((sortOrOptions as FindOptions) ?? {});
    return this.run('findMany', async () => {
      let query = this.db.select().from(this.table).$dynamic();
      const where = this.buildWhere(ctx, filter, options);
      if (where) query = query.where(where);
      const orderBy = this.buildOrderBy(options.sort);
      if (orderBy.length) query = query.orderBy(...orderBy);
      const limit = Math.min(options.limit ?? this.options.maxPageSize ?? MAX_PAGE, this.options.maxPageSize ?? MAX_PAGE);
      query = query.limit(limit);
      if (options.offset) query = query.offset(options.offset);
      return (await query) as T[];
    });
  }

  async exists(ctx: Context, filter: QueryFilter<T>): Promise<boolean> {
    return (await this.findOne(ctx, filter)) !== null;
  }

  async create(ctx: Context, data: Partial<T>): Promise<T> {
    return this.run('create', async () => {
      const rows = await this.db.insert(this.table).values(this.prepareInsert(ctx, data)).returning();
      return rows[0] as T;
    });
  }

  async createMany(ctx: Context, data: Partial<T>[]): Promise<T[]> {
    if (data.length === 0) return [];
    return this.run('createMany', async () => {
      const rows = await this.db.insert(this.table).values(data.map((d) => this.prepareInsert(ctx, d))).returning();
      return rows as T[];
    });
  }

  async update(ctx: Context, id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
    const rows = await this.run('update', () =>
      this.db
        .update(this.table)
        .set(this.preparePatch(data as Record<string, unknown>))
        .where(this.idWhere(ctx, id))
        .returning(),
    );
    if (!rows[0]) throw new NotFoundError(this.resourceName, id);
    return rows[0] as T;
  }

  async updateWhere(ctx: Context, filter: QueryFilter<T>, data: Partial<Omit<T, 'id'>>): Promise<number> {
    const where = this.buildWhere(ctx, filter);
    if (!where) throw new DatabaseError('database/unsafe-operation', 'updateWhere requires a filter');
    const rows = await this.run('updateWhere', () =>
      this.db.update(this.table).set(this.preparePatch(data as Record<string, unknown>)).where(where).returning({ id: this.column('id') as any }),
    );
    return rows.length;
  }

  async softDelete(ctx: Context, id: string): Promise<void> {
    if (!this.softDeleteColumn) return this.hardDelete(ctx, id);
    const rows = await this.run('softDelete', () =>
      this.db
        .update(this.table)
        .set({ [this.softDeleteColumn!]: new Date() } as Record<string, unknown>)
        .where(this.idWhere(ctx, id))
        .returning({ id: this.column('id') as any }),
    );
    if (!rows[0]) throw new NotFoundError(this.resourceName, id);
  }

  async restore(ctx: Context, id: string): Promise<T> {
    if (!this.softDeleteColumn) throw new DatabaseError('database/not-soft-deletable', 'Table has no soft delete column');
    const tenant = this.tenantCondition(ctx);
    const where = tenant ? and(eq(this.column('id'), id), tenant) : eq(this.column('id'), id);
    const rows = await this.run('restore', () =>
      this.db
        .update(this.table)
        .set({ [this.softDeleteColumn!]: null } as Record<string, unknown>)
        .where(where)
        .returning(),
    );
    if (!rows[0]) throw new NotFoundError(this.resourceName, id);
    return rows[0] as T;
  }

  async hardDelete(ctx: Context, id: string): Promise<void> {
    const rows = await this.run('hardDelete', () =>
      this.db.delete(this.table).where(this.idWhere(ctx, id, { withDeleted: true })).returning({ id: this.column('id') as any }),
    );
    if (!rows[0]) throw new NotFoundError(this.resourceName, id);
  }

  async paginate(ctx: Context, params: PaginationParams, filter?: QueryFilter<T>, sort?: SortParams): Promise<PaginatedResult<T>> {
    const pageSize = Math.max(1, Math.min(params.pageSize, this.options.maxPageSize ?? MAX_PAGE));
    const page = Math.max(1, params.page);
    const where = this.buildWhere(ctx, filter);
    return this.run('paginate', async () => {
      const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(this.table).where(where ?? sql`true`);
      let query = this.db.select().from(this.table).$dynamic();
      if (where) query = query.where(where);
      const orderBy = this.buildOrderBy(sort);
      query = query.orderBy(...orderBy, asc(this.column('id')));
      const rows = await query.limit(pageSize).offset((page - 1) * pageSize);
      return { data: rows as T[], total: count, page, pageSize, totalPages: Math.ceil(count / pageSize) || 1 };
    });
  }

  /**
   * Keyset pagination: stable under concurrent inserts and O(1) per page. Orders by `sort.field`
   * (default `createdAt` if present, else `id`) with `id` as tie-breaker.
   */
  async paginateCursor(
    ctx: Context,
    params: CursorPaginationParams,
    filter?: QueryFilter<T>,
    sort?: SortParams,
  ): Promise<CursorPaginatedResult<T>> {
    const limit = Math.max(1, Math.min(params.limit ?? 50, this.options.maxPageSize ?? MAX_PAGE));
    const field = sort?.field ?? ('createdAt' in this.columns() ? 'createdAt' : 'id');
    const direction = sort?.direction ?? 'desc';
    const col = this.column(field);
    const idCol = this.column('id');
    const conditions: SQL[] = [];
    const base = this.buildWhere(ctx, filter);
    if (base) conditions.push(base);
    // Cursor values round-trip as Postgres text so timestamps keep microsecond precision.
    const pgType = (c: AnyPgColumn) => sql.raw(c.getSQLType());
    if (params.cursor) {
      const { value, id } = decodeCursor(params.cursor);
      const op = sql.raw(direction === 'desc' ? '<' : '>');
      conditions.push(
        field === 'id'
          ? sql`${idCol} ${op} ${String(id)}::${pgType(idCol)}`
          : sql`(${col}, ${idCol}) ${op} (${String(value)}::${pgType(col)}, ${String(id)}::${pgType(idCol)})`,
      );
    }
    const order = direction === 'desc' ? [desc(col), desc(idCol)] : [asc(col), asc(idCol)];
    return this.run('paginateCursor', async () => {
      let query = this.db
        .select({ ...getTableColumns(this.table), __cursor: sql<string>`${col}::text`, __cursorId: sql<string>`${idCol}::text` })
        .from(this.table)
        .$dynamic();
      if (conditions.length) query = query.where(and(...conditions));
      const rows = (await query.orderBy(...(field === 'id' ? order.slice(1) : order)).limit(limit + 1)) as Array<
        Record<string, unknown> & { __cursor: string; __cursorId: string }
      >;
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page[page.length - 1];
      const data = page.map(({ __cursor, __cursorId, ...row }) => row as unknown as T);
      return { data, hasMore, nextCursor: hasMore && last ? encodeCursor(last.__cursor, last.__cursorId) : null };
    });
  }

  async count(ctx: Context, filter?: QueryFilter<T>): Promise<number> {
    const where = this.buildWhere(ctx, filter);
    return this.run('count', async () => {
      const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(this.table).where(where ?? sql`true`);
      return count;
    });
  }

  async deleteWhere(ctx: Context, filter: QueryFilter<T>, options: { hard?: boolean } = {}): Promise<number> {
    const hasFilter = Array.isArray(filter) ? filter.length > 0 : Object.values(filter).some((v) => v !== undefined);
    if (!hasFilter) throw new DatabaseError('database/unsafe-operation', 'deleteWhere requires a non-empty filter');
    if (this.softDeleteColumn && !options.hard) {
      return this.updateWhere(ctx, filter, { [this.softDeleteColumn]: new Date() } as Partial<Omit<T, 'id'>>);
    }
    const where = this.buildWhere(ctx, filter, { withDeleted: true })!;
    const rows = await this.run('deleteWhere', () => this.db.delete(this.table).where(where).returning({ id: this.column('id') as any }));
    return rows.length;
  }
}

import type { Context, PaginatedResult, PaginationParams, SortParams, Entity } from '@mariachi/core';
import type { Repository, QueryFilter, FilterCondition } from '@mariachi/database';
import { eq, ne, gt, gte, lt, lte, and, isNull, asc, desc, sql } from 'drizzle-orm';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';

type DrizzleDb = import('drizzle-orm/postgres-js').PostgresJsDatabase<Record<string, never>>;

export interface DrizzleRepositoryOptions {
  tenantColumn?: string;
}

export abstract class DrizzleRepository<T extends Entity> implements Repository<T> {
  constructor(
    protected readonly table: PgTableWithColumns<any>,
    protected readonly db: DrizzleDb,
    protected readonly options: DrizzleRepositoryOptions = {},
  ) {}

  protected get tenantColumn(): string | undefined {
    return this.options.tenantColumn;
  }

  private getTableColumns(): Record<string, import('drizzle-orm').SQLWrapper> {
    return this.table as unknown as Record<string, import('drizzle-orm').SQLWrapper>;
  }

  private isFilterConditions(filter: QueryFilter<T>): filter is FilterCondition[] {
    return Array.isArray(filter);
  }

  private applyFilterOp(col: import('drizzle-orm').SQLWrapper, condition: FilterCondition): import('drizzle-orm').SQL {
    switch (condition.op) {
      case 'eq': return eq(col, condition.value);
      case 'neq': return ne(col, condition.value as any);
      case 'gt': return gt(col, condition.value as any);
      case 'gte': return gte(col, condition.value as any);
      case 'lt': return lt(col, condition.value as any);
      case 'lte': return lte(col, condition.value as any);
      default: return eq(col, condition.value);
    }
  }

  protected buildWhere(ctx: Context, filter?: QueryFilter<T>) {
    const conditions: import('drizzle-orm').SQL[] = [];
    const cols = this.getTableColumns();

    const deletedAtCol = cols['deletedAt'];
    if (deletedAtCol) {
      conditions.push(isNull(deletedAtCol));
    }

    if (this.tenantColumn && ctx.tenantId) {
      const col = cols[this.tenantColumn];
      if (col) conditions.push(eq(col, ctx.tenantId));
    }

    if (filter) {
      if (this.isFilterConditions(filter)) {
        for (const cond of filter) {
          const col = cols[cond.field];
          if (col) conditions.push(this.applyFilterOp(col, cond));
        }
      } else {
        for (const [key, value] of Object.entries(filter)) {
          if (value === undefined) continue;
          const col = cols[key];
          if (col) conditions.push(eq(col, value));
        }
      }
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  protected buildOrderBy(sort?: SortParams) {
    if (!sort) return undefined;
    const cols = this.getTableColumns();
    const col = cols[sort.field];
    if (!col) return undefined;
    return sort.direction === 'desc' ? desc(col) : asc(col);
  }

  async findById(ctx: Context, id: string): Promise<T | null> {
    const where = this.buildWhere(ctx);
    const cols = this.getTableColumns();
    const idCol = cols['id'];
    const condition = where ? and(eq(idCol, id), where) : eq(idCol, id);
    const rows = await this.db.select().from(this.table).where(condition).limit(1);
    return (rows[0] as T) ?? null;
  }

  async findMany(ctx: Context, filter?: QueryFilter<T>, sort?: SortParams): Promise<T[]> {
    const where = this.buildWhere(ctx, filter);
    const orderBy = this.buildOrderBy(sort);
    let query = this.db.select().from(this.table);
    if (where) query = query.where(where) as typeof query;
    if (orderBy) query = query.orderBy(orderBy) as typeof query;
    const rows = await query;
    return rows as T[];
  }

  async create(ctx: Context, data: Omit<T, 'id'>): Promise<T> {
    const insertData: Record<string, unknown> = {
      ...data,
      id: crypto.randomUUID(),
    };
    if (this.tenantColumn && ctx.tenantId && !(this.tenantColumn in insertData)) {
      insertData[this.tenantColumn] = ctx.tenantId;
    }
    const rows = await this.db.insert(this.table).values(insertData).returning();
    return rows[0] as T;
  }

  async update(ctx: Context, id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
    const where = this.buildWhere(ctx);
    const cols = this.getTableColumns();
    const idCol = cols['id'];
    const condition = where ? and(eq(idCol, id), where) : eq(idCol, id);
    const rows = await this.db
      .update(this.table)
      .set(data as Record<string, unknown>)
      .where(condition)
      .returning();
    const row = rows[0];
    if (!row) throw new Error(`Entity not found: ${id}`);
    return row as T;
  }

  async softDelete(ctx: Context, id: string): Promise<void> {
    const where = this.buildWhere(ctx);
    const cols = this.getTableColumns();
    const idCol = cols['id'];
    const deletedAtCol = cols['deletedAt'];
    const condition = where ? and(eq(idCol, id), where) : eq(idCol, id);
    if (deletedAtCol) {
      await this.db
        .update(this.table)
        .set({ deletedAt: new Date() } as Record<string, unknown>)
        .where(condition);
    } else {
      await this.db.delete(this.table).where(condition);
    }
  }

  async hardDelete(ctx: Context, id: string): Promise<void> {
    const where = this.buildWhere(ctx);
    const cols = this.getTableColumns();
    const idCol = cols['id'];
    const condition = where ? and(eq(idCol, id), where) : eq(idCol, id);
    await this.db.delete(this.table).where(condition);
  }

  async paginate(
    ctx: Context,
    params: PaginationParams,
    filter?: QueryFilter<T>,
    sort?: SortParams,
  ): Promise<PaginatedResult<T>> {
    const where = this.buildWhere(ctx, filter);
    const orderBy = this.buildOrderBy(sort);
    const offset = (params.page - 1) * params.pageSize;

    const countResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(this.table)
      .where(where ?? sql`true`);

    const total = countResult[0]?.count ?? 0;

    let query = this.db.select().from(this.table);
    if (where) query = query.where(where) as typeof query;
    if (orderBy) query = query.orderBy(orderBy) as typeof query;
    const rows = await query.limit(params.pageSize).offset(offset);

    const totalPages = Math.ceil(total / params.pageSize) || 1;

    return {
      data: rows as T[],
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages,
    };
  }

  async count(ctx: Context, filter?: QueryFilter<T>): Promise<number> {
    const where = this.buildWhere(ctx, filter);
    const countResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(this.table)
      .where(where ?? sql`true`);
    return countResult[0]?.count ?? 0;
  }

  async deleteWhere(ctx: Context, filter: QueryFilter<T>): Promise<number> {
    const where = this.buildWhere(ctx, filter);
    if (!where) return 0;
    const result = await this.db
      .delete(this.table)
      .where(where)
      .returning();
    return result.length;
  }
}

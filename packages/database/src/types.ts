import type {
  Entity,
  Context,
  CursorPaginatedResult,
  CursorPaginationParams,
  PaginatedResult,
  PaginationParams,
  SortParams,
} from '@mariachi/core';

export interface DatabaseConfig {
  adapter: string;
  url: string;
  poolMin?: number;
  poolMax?: number;
  /** Per-statement timeout. Default 30s. */
  statementTimeoutMs?: number;
  /** `require` for managed Postgres; `false` for local. */
  ssl?: boolean | 'require' | 'prefer';
  applicationName?: string;
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  /** Round-trips a trivial query (`SELECT 1`). */
  ping(): Promise<boolean>;
  getClient<T = unknown>(): T;
}

/** @deprecated Use `DatabaseAdapter` instead. */
export type DatabaseClient = DatabaseAdapter;

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'like' | 'ilike' | 'isNull' | 'isNotNull';

export interface FilterCondition {
  field: string;
  op: FilterOp;
  value?: unknown;
}

export type QueryFilter<T> = Partial<T> | FilterCondition[];

export interface FindOptions {
  sort?: SortParams | SortParams[];
  limit?: number;
  offset?: number;
  /** Include soft-deleted rows. */
  withDeleted?: boolean;
}

export interface Repository<T extends Entity> {
  findById(ctx: Context, id: string, options?: Pick<FindOptions, 'withDeleted'>): Promise<T | null>;
  /** Like findById but throws `NotFoundError`. */
  getById(ctx: Context, id: string): Promise<T>;
  findOne(ctx: Context, filter: QueryFilter<T>): Promise<T | null>;
  findMany(ctx: Context, filter?: QueryFilter<T>, sort?: SortParams | FindOptions): Promise<T[]>;
  exists(ctx: Context, filter: QueryFilter<T>): Promise<boolean>;
  create(ctx: Context, data: Partial<T>): Promise<T>;
  createMany(ctx: Context, data: Partial<T>[]): Promise<T[]>;
  update(ctx: Context, id: string, data: Partial<Omit<T, 'id'>>): Promise<T>;
  updateWhere(ctx: Context, filter: QueryFilter<T>, data: Partial<Omit<T, 'id'>>): Promise<number>;
  softDelete(ctx: Context, id: string): Promise<void>;
  restore(ctx: Context, id: string): Promise<T>;
  hardDelete(ctx: Context, id: string): Promise<void>;
  paginate(ctx: Context, params: PaginationParams, filter?: QueryFilter<T>, sort?: SortParams): Promise<PaginatedResult<T>>;
  paginateCursor(ctx: Context, params: CursorPaginationParams, filter?: QueryFilter<T>, sort?: SortParams): Promise<CursorPaginatedResult<T>>;
  count(ctx: Context, filter?: QueryFilter<T>): Promise<number>;
  /** Soft-deletes matching rows when the table supports it; pass `{ hard: true }` to delete. */
  deleteWhere(ctx: Context, filter: QueryFilter<T>, options?: { hard?: boolean }): Promise<number>;
}

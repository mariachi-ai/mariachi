import type { Entity, Context, PaginatedResult, PaginationParams, SortParams } from '@mariachi/core';

export interface DatabaseConfig {
  adapter: string;
  url: string;
  poolMin?: number;
  poolMax?: number;
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getClient<T = unknown>(): T;
}

/** @deprecated Use `DatabaseAdapter` instead. */
export type DatabaseClient = DatabaseAdapter;

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';

export interface FilterCondition {
  field: string;
  op: FilterOp;
  value: unknown;
}

export type QueryFilter<T> = Partial<T> | FilterCondition[];

export interface Repository<T extends Entity> {
  findById(ctx: Context, id: string): Promise<T | null>;
  findMany(ctx: Context, filter?: QueryFilter<T>, sort?: SortParams): Promise<T[]>;
  create(ctx: Context, data: Omit<T, 'id'>): Promise<T>;
  update(ctx: Context, id: string, data: Partial<Omit<T, 'id'>>): Promise<T>;
  softDelete(ctx: Context, id: string): Promise<void>;
  hardDelete(ctx: Context, id: string): Promise<void>;
  paginate(ctx: Context, params: PaginationParams, filter?: QueryFilter<T>, sort?: SortParams): Promise<PaginatedResult<T>>;
  count(ctx: Context, filter?: QueryFilter<T>): Promise<number>;
  deleteWhere(ctx: Context, filter: QueryFilter<T>): Promise<number>;
}

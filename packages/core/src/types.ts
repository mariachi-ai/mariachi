import type { z } from 'zod';
import type { Context } from './context';

export type Handler<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> = (ctx: Context, input: z.infer<TInput>) => Promise<z.infer<TOutput>>;

export type Middleware = (
  ctx: Context,
  next: () => Promise<void>,
) => Promise<void>;

export interface HandlerRegistration<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> {
  schema: {
    input: TInput;
    output: TOutput;
  };
  handler: Handler<TInput, TOutput>;
  middleware?: Middleware[];
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

export interface Entity {
  id: string;
}

export interface BaseEntity extends Entity {
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TenantEntity extends BaseEntity {
  tenantId: string;
}

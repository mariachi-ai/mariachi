import type { Context } from '@mariachi/core';
import type { Entity, PaginatedResult, PaginationParams, QueryFilter, FilterCondition, Repository, SortParams } from '../types';

export class TestRepository<T extends Entity> implements Repository<T> {
  private readonly store: T[] = [];
  private readonly tenantColumn?: string;

  constructor(options?: { tenantColumn?: string }) {
    this.tenantColumn = options?.tenantColumn;
  }

  private filterByContext(ctx: Context, items: T[]): T[] {
    return items.filter((item) => {
      if (this.tenantColumn && ctx.tenantId) {
        const tenantId = (item as Record<string, unknown>)[this.tenantColumn];
        if (tenantId !== ctx.tenantId) return false;
      }
      return true;
    });
  }

  private isFilterConditions(filter: QueryFilter<T>): filter is FilterCondition[] {
    return Array.isArray(filter);
  }

  private matchesFilter(item: T, filter?: QueryFilter<T>): boolean {
    if (!filter) return true;

    if (this.isFilterConditions(filter)) {
      return filter.every((cond) => {
        const val = (item as Record<string, unknown>)[cond.field];
        switch (cond.op) {
          case 'eq': return val === cond.value;
          case 'neq': return val !== cond.value;
          case 'gt': return (val as any) > (cond.value as any);
          case 'gte': return (val as any) >= (cond.value as any);
          case 'lt': return (val as any) < (cond.value as any);
          case 'lte': return (val as any) <= (cond.value as any);
          default: return true;
        }
      });
    }

    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      const itemVal = (item as Record<string, unknown>)[key];
      if (itemVal !== value) return false;
    }
    return true;
  }

  private excludeDeleted(items: T[]): T[] {
    return items.filter((i) => {
      const deletedAt = (i as Record<string, unknown>)['deletedAt'];
      return deletedAt === undefined || deletedAt === null;
    });
  }

  private applySort(items: T[], sort?: SortParams): T[] {
    if (!sort) return items;
    const field = sort.field;
    const direction = sort.direction === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[field];
      const bVal = (b as Record<string, unknown>)[field];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return direction;
      if (bVal == null) return -direction;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return direction * aVal.localeCompare(bVal);
      }
      if (aVal instanceof Date && bVal instanceof Date) {
        return direction * (aVal.getTime() - bVal.getTime());
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return direction * (aVal - bVal);
      }
      return 0;
    });
  }

  async findById(ctx: Context, id: string): Promise<T | null> {
    const filtered = this.excludeDeleted(this.filterByContext(ctx, this.store));
    const item = filtered.find((i) => i.id === id);
    return item ?? null;
  }

  async findMany(ctx: Context, filter?: QueryFilter<T>, sort?: SortParams): Promise<T[]> {
    let items = this.excludeDeleted(this.filterByContext(ctx, this.store));
    items = items.filter((i) => this.matchesFilter(i, filter));
    return this.applySort(items, sort);
  }

  async create(ctx: Context, data: Omit<T, 'id'>): Promise<T> {
    const entity = {
      ...data,
      id: crypto.randomUUID(),
      ...(this.tenantColumn && ctx.tenantId ? { [this.tenantColumn]: ctx.tenantId } : {}),
    } as T;
    this.store.push(entity);
    return entity;
  }

  async update(ctx: Context, id: string, data: Partial<Omit<T, 'id'>>): Promise<T> {
    const filtered = this.filterByContext(ctx, this.store);
    const idx = this.store.findIndex((i) => i.id === id && filtered.includes(i));
    if (idx === -1) throw new Error(`Entity not found: ${id}`);
    const updated = { ...this.store[idx], ...data } as T;
    this.store[idx] = updated;
    return updated;
  }

  async softDelete(ctx: Context, id: string): Promise<void> {
    const filtered = this.filterByContext(ctx, this.store);
    const item = filtered.find((i) => i.id === id);
    if (!item) return;
    (item as Record<string, unknown>)['deletedAt'] = new Date();
  }

  async hardDelete(ctx: Context, id: string): Promise<void> {
    const filtered = this.filterByContext(ctx, this.store);
    const idx = this.store.findIndex((i) => i.id === id && filtered.includes(i));
    if (idx !== -1) this.store.splice(idx, 1);
  }

  async paginate(
    ctx: Context,
    params: PaginationParams,
    filter?: QueryFilter<T>,
    sort?: SortParams,
  ): Promise<PaginatedResult<T>> {
    let items = this.excludeDeleted(this.filterByContext(ctx, this.store));
    items = items.filter((i) => this.matchesFilter(i, filter));
    items = this.applySort(items, sort);
    const total = items.length;
    const offset = (params.page - 1) * params.pageSize;
    const data = items.slice(offset, offset + params.pageSize);
    const totalPages = Math.ceil(total / params.pageSize) || 1;
    return {
      data,
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages,
    };
  }

  async count(ctx: Context, filter?: QueryFilter<T>): Promise<number> {
    let items = this.excludeDeleted(this.filterByContext(ctx, this.store));
    items = items.filter((i) => this.matchesFilter(i, filter));
    return items.length;
  }

  async deleteWhere(ctx: Context, filter: QueryFilter<T>): Promise<number> {
    const filtered = this.filterByContext(ctx, this.store);
    const toDelete = filtered.filter((i) => this.matchesFilter(i, filter));
    let count = 0;
    for (const item of toDelete) {
      const idx = this.store.indexOf(item);
      if (idx !== -1) {
        this.store.splice(idx, 1);
        count++;
      }
    }
    return count;
  }
}

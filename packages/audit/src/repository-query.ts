import type { Context, PaginationParams, PaginatedResult } from '@mariachi/core';
import type { Repository, FilterCondition } from '@mariachi/database';
import type { AuditEntry, AuditQuery, AuditQueryFilter } from './types';

export class RepositoryAuditQuery implements AuditQuery {
  constructor(
    private readonly repository: Repository<AuditEntry>,
    private readonly ctx: Context,
  ) {}

  async find(
    filter: AuditQueryFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<AuditEntry>> {
    const conditions: FilterCondition[] = [];

    if (filter.actor) conditions.push({ field: 'actor', op: 'eq', value: filter.actor });
    if (filter.action) conditions.push({ field: 'action', op: 'eq', value: filter.action });
    if (filter.resource) conditions.push({ field: 'resource', op: 'eq', value: filter.resource });
    if (filter.resourceId) conditions.push({ field: 'resourceId', op: 'eq', value: filter.resourceId });
    if (filter.tenantId) conditions.push({ field: 'tenantId', op: 'eq', value: filter.tenantId });
    if (filter.from) conditions.push({ field: 'occurredAt', op: 'gte', value: filter.from });
    if (filter.to) conditions.push({ field: 'occurredAt', op: 'lte', value: filter.to });

    return this.repository.paginate(
      this.ctx,
      pagination,
      conditions.length > 0 ? conditions : undefined,
      { field: 'occurredAt', direction: 'desc' },
    );
  }

  async findByResource(resource: string, resourceId: string): Promise<AuditEntry[]> {
    return this.repository.findMany(
      this.ctx,
      { resource, resourceId } as Partial<AuditEntry>,
      { field: 'occurredAt', direction: 'desc' },
    );
  }
}

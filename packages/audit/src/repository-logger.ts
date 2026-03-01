import type { Context } from '@mariachi/core';
import type { Repository } from '@mariachi/database';
import type { AuditEntry, AuditLogOptions, AuditLogger } from './types';

export class RepositoryAuditLogger implements AuditLogger {
  constructor(
    private readonly repository: Repository<AuditEntry>,
    private readonly ctx: Context,
    private readonly enqueueJob?: (fn: () => Promise<void>) => void,
  ) {}

  async log(entry: AuditLogOptions): Promise<void> {
    const write = async () => {
      await this.repository.create(this.ctx, {
        actor: entry.actor,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        tenantId: entry.tenantId ?? null,
        ipAddress: entry.ipAddress ?? undefined,
        userAgent: entry.userAgent ?? undefined,
        occurredAt: new Date(),
        metadata: entry.metadata ?? undefined,
      });
    };

    if (this.enqueueJob) {
      this.enqueueJob(write);
    } else {
      await write();
    }
  }
}

import { AuditError, type Context } from '@mariachi/core';
import type { Repository } from '@mariachi/database';
import { auditCanonical, chainHash, GENESIS_HASH } from './chain';
import type { AuditEntry, AuditLogOptions, AuditLogger } from './types';

export type AuditEnqueue = (ctx: Context, write: () => Promise<void>) => Promise<void>;

/**
 * Writes audit rows through a repository. `ctx` is taken on every call.
 * When enqueueing fails, the entry is written inline so it is not dropped.
 * Set `chain` to hash-link each row to the previous one for that tenant. The chain tail is kept
 * in this process, so it restarts on each boot and forks across instances; use
 * `DrizzleAuditLog` from `@mariachi/audit/postgres` for a chain that holds in production.
 */
export class RepositoryAuditLogger implements AuditLogger {
  private readonly tails = new Map<string, Promise<string>>();

  constructor(
    private readonly repository: Repository<AuditEntry>,
    private readonly enqueue?: AuditEnqueue,
    private readonly chain = false,
  ) {}

  async log(ctx: Context, entry: AuditLogOptions): Promise<void> {
    const write = () => this.write(ctx, entry);
    if (!this.enqueue) {
      await write();
      return;
    }
    try {
      await this.enqueue(ctx, write);
    } catch (error) {
      try {
        await write();
      } catch (fallback) {
        throw new AuditError('audit/enqueue-failed', 'Audit enqueue failed and the inline write also failed', {
          enqueue: error instanceof Error ? error.message : String(error),
          write: fallback instanceof Error ? fallback.message : String(fallback),
        });
      }
    }
  }

  private async write(ctx: Context, entry: AuditLogOptions): Promise<void> {
    const occurredAt = new Date();
    const tenantKey = entry.tenantId ?? ctx.tenantId ?? '';
    const previous = this.tails.get(tenantKey) ?? Promise.resolve(GENESIS_HASH);
    const next = previous.then(async (prevHash) => {
      const canonical = auditCanonical({ ...entry, tenantId: entry.tenantId ?? ctx.tenantId, occurredAt: occurredAt.toISOString() });
      const entryHash = this.chain ? chainHash(prevHash, canonical) : '';
      await this.repository.create(ctx, {
        actor: entry.actor,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        tenantId: entry.tenantId ?? ctx.tenantId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        occurredAt,
        metadata: entry.metadata,
        prevHash: this.chain ? prevHash : null,
        entryHash,
      });
      return entryHash || prevHash;
    });
    this.tails.set(tenantKey, next.catch(() => GENESIS_HASH));
    await next;
  }
}

import type { RoleStore } from '../types';

export interface RoleCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** Caches `getRoles` and drops the entry on grant or revoke. */
export class CachedRoleStore implements RoleStore {
  constructor(
    private readonly inner: RoleStore,
    private readonly cache: RoleCache,
    private readonly ttlSeconds = 30,
  ) {}

  private key(userId: string, tenantId?: string): string {
    return `rbac:${userId}:${tenantId ?? ''}`;
  }

  async getRoles(userId: string, tenantId?: string): Promise<string[]> {
    const key = this.key(userId, tenantId);
    const hit = await this.cache.get(key);
    if (hit) return JSON.parse(hit) as string[];
    const roles = await this.inner.getRoles(userId, tenantId);
    await this.cache.set(key, JSON.stringify(roles), this.ttlSeconds);
    return roles;
  }

  async grant(userId: string, role: string, tenantId?: string): Promise<void> {
    await this.inner.grant(userId, role, tenantId);
    await this.cache.del(this.key(userId, tenantId));
  }

  async revoke(userId: string, role: string, tenantId?: string): Promise<void> {
    await this.inner.revoke(userId, role, tenantId);
    await this.cache.del(this.key(userId, tenantId));
  }
}

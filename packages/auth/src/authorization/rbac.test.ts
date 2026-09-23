import { describe, expect, it } from 'vitest';
import { RBACAdapter, InMemoryRoleStore } from './rbac';
import type { Permission, ResolvedIdentity } from '../types';

const user: ResolvedIdentity = { userId: 'u1', tenantId: 't1', scopes: [], identityType: 'session' };

describe('RBACAdapter', () => {
  it('merges code permissions with a permission source and inherits roles', async () => {
    const store = new InMemoryRoleStore();
    await store.grant('u1', 'editor', 't1');
    const rbac = new RBACAdapter({
      permissions: [{ role: 'viewer', action: 'read', resource: '*' }],
      roles: [{ name: 'editor', inherits: ['viewer'] }],
      store,
      permissionSource: { loadPermissions: async () => [{ role: 'editor', action: 'update', resource: 'posts' }] },
    });
    expect(await rbac.can(user, 'read', 'posts')).toBe(true);
    expect(await rbac.can(user, 'update', 'posts')).toBe(true);
    expect(await rbac.can(user, 'delete', 'posts')).toBe(false);
  });

  it('reuses loaded permissions until the TTL passes or refresh is called', async () => {
    const store = new InMemoryRoleStore();
    await store.grant('u1', 'editor', 't1');
    let perms: Permission[] = [];
    let loads = 0;
    const rbac = new RBACAdapter({
      store,
      permissionTtlMs: 60_000,
      permissionSource: { loadPermissions: async () => { loads += 1; return perms; } },
    });
    await Promise.all([rbac.can(user, 'read', 'posts'), rbac.can(user, 'read', 'posts')]);
    expect(loads).toBe(1);
    perms = [{ role: 'editor', action: 'read', resource: 'posts' }];
    expect(await rbac.can(user, 'read', 'posts')).toBe(false);
    await rbac.refreshPermissions();
    expect(await rbac.can(user, 'read', 'posts')).toBe(true);
  });
});

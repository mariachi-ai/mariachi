import type { AuthorizationAdapter, Permission, RBACConfig, ResolvedIdentity, RoleStore } from '../types';

export class InMemoryRoleStore implements RoleStore {
  private readonly assignments = new Map<string, Set<string>>();

  private k(userId: string, tenantId?: string) {
    return `${userId}:${tenantId ?? ''}`;
  }

  async getRoles(userId: string, tenantId?: string): Promise<string[]> {
    return [...(this.assignments.get(this.k(userId, tenantId)) ?? [])];
  }

  async grant(userId: string, role: string, tenantId?: string): Promise<void> {
    const key = this.k(userId, tenantId);
    const set = this.assignments.get(key) ?? new Set();
    set.add(role);
    this.assignments.set(key, set);
  }

  async revoke(userId: string, role: string, tenantId?: string): Promise<void> {
    const key = this.k(userId, tenantId);
    const set = this.assignments.get(key);
    if (!set) return;
    set.delete(role);
    if (set.size === 0) this.assignments.delete(key);
  }
}

/**
 * Role-based access control. Permissions support `*` for action or resource, roles can inherit
 * other roles, and roles are taken from both the store and the identity's token claims.
 * Permissions come from `config.permissions` plus, when set, `config.permissionSource`
 * (reloaded after `permissionTtlMs`).
 */
export class RBACAdapter implements AuthorizationAdapter {
  private permissionsByRole = new Map<string, Set<string>>();
  private readonly inherits = new Map<string, string[]>();
  private readonly store: RoleStore;
  private readonly ttlMs: number;
  private loadedAt = 0;
  private loading?: Promise<void>;

  constructor(private readonly config: RBACConfig) {
    this.permissionsByRole = indexPermissions(config.permissions ?? []);
    for (const r of config.roles ?? []) this.inherits.set(r.name, r.inherits ?? []);
    this.store = config.store ?? new InMemoryRoleStore();
    this.ttlMs = config.permissionTtlMs ?? 30_000;
  }

  /** Reloads permissions from `permissionSource` now, e.g. after editing a role. */
  async refreshPermissions(): Promise<void> {
    const source = this.config.permissionSource;
    if (!source) return;
    const loaded = await source.loadPermissions();
    this.permissionsByRole = indexPermissions([...(this.config.permissions ?? []), ...loaded]);
    this.loadedAt = Date.now();
  }

  private async ensurePermissions(): Promise<void> {
    if (!this.config.permissionSource) return;
    if (this.loadedAt && Date.now() - this.loadedAt < this.ttlMs) return;
    // One load at a time; concurrent checks wait for it.
    this.loading ??= this.refreshPermissions().finally(() => {
      this.loading = undefined;
    });
    await this.loading;
  }

  /** Expands a role list with inherited roles (cycle-safe). */
  expandRoles(roles: string[]): Set<string> {
    const out = new Set<string>();
    const stack = [...roles];
    while (stack.length) {
      const role = stack.pop()!;
      if (out.has(role)) continue;
      out.add(role);
      stack.push(...(this.inherits.get(role) ?? []));
    }
    return out;
  }

  roleAllows(role: string, action: string, resource: string): boolean {
    const perms = this.permissionsByRole.get(role);
    if (!perms) return false;
    return (
      perms.has(`${action}:${resource}`) ||
      perms.has(`*:${resource}`) ||
      perms.has(`${action}:*`) ||
      perms.has('*:*')
    );
  }

  async can(identity: ResolvedIdentity, action: string, resource: string): Promise<boolean> {
    if (this.config.superuserScope && identity.scopes.includes(this.config.superuserScope)) return true;
    await this.ensurePermissions();
    const stored = await this.store.getRoles(identity.userId, identity.tenantId);
    const roles = this.expandRoles([...stored, ...(identity.roles ?? [])]);
    for (const role of roles) if (this.roleAllows(role, action, resource)) return true;
    return false;
  }

  grant(userId: string, role: string, tenantId?: string): Promise<void> {
    return this.store.grant(userId, role, tenantId);
  }

  revoke(userId: string, role: string, tenantId?: string): Promise<void> {
    return this.store.revoke(userId, role, tenantId);
  }

  getRoles(userId: string, tenantId?: string): Promise<string[]> {
    return this.store.getRoles(userId, tenantId);
  }
}

function indexPermissions(permissions: Permission[]): Map<string, Set<string>> {
  const byRole = new Map<string, Set<string>>();
  for (const p of permissions) {
    const set = byRole.get(p.role) ?? new Set();
    set.add(`${p.action}:${p.resource}`);
    byRole.set(p.role, set);
  }
  return byRole;
}

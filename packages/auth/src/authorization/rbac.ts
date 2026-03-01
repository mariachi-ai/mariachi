import type {
  AuthorizationAdapter,
  Permission,
  RBACConfig,
  ResolvedIdentity,
} from '../types';

export class RBACAdapter implements AuthorizationAdapter {
  private readonly roleMap = new Map<string, Set<string>>();
  private readonly permissionMap: Map<string, Set<string>>;

  constructor(private readonly config: RBACConfig) {
    this.permissionMap = new Map();
    for (const p of config.permissions) {
      const key = `${p.role}:${p.action}:${p.resource}`;
      const roleKey = p.role;
      if (!this.permissionMap.has(roleKey)) {
        this.permissionMap.set(roleKey, new Set());
      }
      this.permissionMap.get(roleKey)!.add(`${p.action}:${p.resource}`);
    }
  }

  private roleKey(userId: string, tenantId?: string): string {
    return tenantId ? `${userId}:${tenantId}` : `${userId}:`;
  }

  async can(identity: ResolvedIdentity, action: string, resource: string): Promise<boolean> {
    const key = this.roleKey(identity.userId, identity.tenantId);
    const roles = this.roleMap.get(key);
    if (!roles) return false;
    for (const role of roles) {
      const perms = this.permissionMap.get(role);
      if (perms?.has(`${action}:${resource}`)) return true;
    }
    return false;
  }

  async grant(userId: string, role: string, tenantId?: string): Promise<void> {
    const key = this.roleKey(userId, tenantId);
    let roles = this.roleMap.get(key);
    if (!roles) {
      roles = new Set();
      this.roleMap.set(key, roles);
    }
    roles.add(role);
  }

  async revoke(userId: string, role: string, tenantId?: string): Promise<void> {
    const key = this.roleKey(userId, tenantId);
    const roles = this.roleMap.get(key);
    if (roles) {
      roles.delete(role);
      if (roles.size === 0) this.roleMap.delete(key);
    }
  }

  async getRoles(userId: string, tenantId?: string): Promise<string[]> {
    const key = this.roleKey(userId, tenantId);
    const roles = this.roleMap.get(key);
    return roles ? [...roles] : [];
  }
}

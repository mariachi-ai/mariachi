import { and, eq } from 'drizzle-orm';
import { AuthError } from '@mariachi/core';
import { compileTable, type DrizzleDb } from '@mariachi/database-postgres';
import { rolesTable } from '../schema/roles';
import { userRolesTable } from '../schema/user-roles';
import type { Permission, PermissionSource, RoleStore } from '../types';

const roles = compileTable(rolesTable);
const userRoles = compileTable(userRolesTable);

/**
 * Role assignments from `user_roles` joined to `roles`. Permissions live on `roles.permissions`.
 * Pass it as both `store` and `permissionSource` to `createAuthorization`.
 */
export class DrizzleRoleStore implements RoleStore, PermissionSource {
  constructor(private readonly db: DrizzleDb) {}

  async getRoles(userId: string, tenantId?: string): Promise<string[]> {
    const where = tenantId
      ? and(eq(userRoles.userId, userId), eq(userRoles.tenantId, tenantId))
      : eq(userRoles.userId, userId);
    const rows = await this.db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(where);
    return rows.map((r) => r.name);
  }

  async grant(userId: string, role: string, tenantId?: string): Promise<void> {
    if (!tenantId) throw new AuthError('auth/tenant-required', 'Granting a role requires a tenantId');
    const [found] = await this.db.select().from(roles).where(eq(roles.name, role)).limit(1);
    if (!found) throw new AuthError('auth/unknown-role', `Role ${role} is not defined`);
    const existing = await this.db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.tenantId, tenantId), eq(userRoles.roleId, found.id)))
      .limit(1);
    if (existing.length > 0) return;
    await this.db.insert(userRoles).values({ userId, tenantId, roleId: found.id });
  }

  async revoke(userId: string, role: string, tenantId?: string): Promise<void> {
    const [found] = await this.db.select().from(roles).where(eq(roles.name, role)).limit(1);
    if (!found) return;
    const where = tenantId
      ? and(eq(userRoles.userId, userId), eq(userRoles.tenantId, tenantId), eq(userRoles.roleId, found.id))
      : and(eq(userRoles.userId, userId), eq(userRoles.roleId, found.id));
    await this.db.delete(userRoles).where(where);
  }

  /** Creates the role, or replaces its permissions. Call `RBACAdapter.refreshPermissions()` afterwards. */
  async defineRole(name: string, permissions: Array<{ action: string; resource: string }>, description?: string): Promise<void> {
    await this.db
      .insert(roles)
      .values({ name, description: description ?? null, permissions })
      .onConflictDoUpdate({
        target: roles.name,
        set: { permissions, ...(description !== undefined ? { description } : {}), updatedAt: new Date() },
      });
  }

  /** Reads `{ action, resource }[]` stored on each role row. */
  async loadPermissions(): Promise<Permission[]> {
    const rows = await this.db.select().from(roles);
    const out: Permission[] = [];
    for (const row of rows) {
      const list = Array.isArray(row.permissions) ? row.permissions : [];
      for (const item of list as Array<{ action?: string; resource?: string }>) {
        if (item?.action && item.resource) out.push({ role: row.name, action: item.action, resource: item.resource });
      }
    }
    return out;
  }
}

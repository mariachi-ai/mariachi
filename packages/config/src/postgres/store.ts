import { eq, sql } from 'drizzle-orm';
import { compileTable, type DrizzleDb } from '@mariachi/database-postgres';
import { featureFlagsTable } from '../schema/feature-flags';
import type { FeatureFlagRecord, FeatureFlagStore, TenantFlagOverride } from '../types';

const flags = compileTable(featureFlagsTable);

/**
 * Reads the `feature_flags` table. Wrap it in `createFeatureFlags({ adapter: 'store', store })`
 * so lookups are cached and tenant overrides are applied. After a write, call `flags.invalidate(key)`
 * (other processes pick the change up when their cache TTL passes).
 */
export class DrizzleFeatureFlagStore implements FeatureFlagStore {
  constructor(private readonly db: DrizzleDb) {}

  async get(key: string): Promise<FeatureFlagRecord | null> {
    const [row] = await this.db.select().from(flags).where(eq(flags.key, key)).limit(1);
    if (!row) return null;
    return {
      key: row.key,
      enabled: row.enabled,
      tenantOverrides: row.tenantOverrides ?? undefined,
      metadata: row.metadata ?? undefined,
    };
  }

  /** Creates or replaces a flag's default, rollout metadata and description. Tenant overrides are kept. */
  async set(record: Omit<FeatureFlagRecord, 'tenantOverrides'> & { description?: string }): Promise<void> {
    const values = {
      key: record.key,
      enabled: record.enabled,
      metadata: record.metadata ?? null,
      ...(record.description !== undefined ? { description: record.description } : {}),
    };
    await this.db
      .insert(flags)
      .values(values)
      .onConflictDoUpdate({ target: flags.key, set: { ...values, updatedAt: new Date() } });
  }

  /**
   * Sets (or with `null`, removes) one tenant's override in a single statement, so concurrent
   * changes for different tenants don't overwrite each other. Returns false if the flag doesn't exist.
   */
  async setTenantOverride(key: string, tenantId: string, override: TenantFlagOverride | null): Promise<boolean> {
    const next =
      override === null
        ? sql`coalesce(${flags.tenantOverrides}, '{}'::jsonb) - ${tenantId}::text`
        : sql`coalesce(${flags.tenantOverrides}, '{}'::jsonb) || jsonb_build_object(${tenantId}::text, ${JSON.stringify(override)}::jsonb)`;
    const rows = await this.db
      .update(flags)
      .set({ tenantOverrides: next, updatedAt: new Date() })
      .where(eq(flags.key, key))
      .returning({ key: flags.key });
    return rows.length > 0;
  }
}

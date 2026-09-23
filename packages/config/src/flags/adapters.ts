import { createHash } from 'node:crypto';
import type { FeatureFlagAdapter, FeatureFlagRecord, FeatureFlagStore, FlagContext } from '../types';

function bucket(flag: string, subject: string): number {
  const hash = createHash('sha256').update(`${flag}:${subject}`).digest();
  return hash.readUInt32BE(0) % 100;
}

/** Evaluates a flag record: tenant override, then user allowlist, then percentage rollout, then the default. */
export function evaluateFlag(record: FeatureFlagRecord | null, flag: string, ctx: FlagContext = {}): { enabled: boolean; variant?: string } {
  if (!record) return { enabled: false };
  const override = ctx.tenantId ? record.tenantOverrides?.[ctx.tenantId] : undefined;
  if (override !== undefined) {
    if (typeof override === 'boolean') return { enabled: override, variant: record.metadata?.variant };
    return { enabled: override.enabled ?? record.enabled, variant: override.variant ?? record.metadata?.variant };
  }
  const meta = record.metadata ?? {};
  if (ctx.userId && meta.users?.includes(ctx.userId)) return { enabled: true, variant: meta.variant };
  if (record.enabled && typeof meta.rolloutPercent === 'number' && meta.rolloutPercent < 100) {
    const subject = ctx.userId ?? ctx.tenantId;
    if (!subject) return { enabled: false };
    return { enabled: bucket(flag, subject) < meta.rolloutPercent, variant: meta.variant };
  }
  return { enabled: record.enabled, variant: meta.variant };
}

/** Reads flags from a `FeatureFlagStore` (e.g. a repository over the `feature_flags` table). */
export class StoreFeatureFlagAdapter implements FeatureFlagAdapter {
  constructor(private readonly store: FeatureFlagStore) {}

  invalidate(flag?: string): void {
    if (this.store instanceof CachedFeatureFlags) this.store.invalidate(flag);
  }

  async isEnabled(flag: string, context?: FlagContext): Promise<boolean> {
    return evaluateFlag(await this.store.get(flag), flag, context).enabled;
  }

  async getVariant(flag: string, context?: FlagContext): Promise<string | undefined> {
    const result = evaluateFlag(await this.store.get(flag), flag, context);
    return result.enabled ? result.variant : undefined;
  }
}

/** Flags from a fixed map. Useful for config-driven kill switches and tests. */
export class StaticFeatureFlagAdapter implements FeatureFlagAdapter {
  constructor(private readonly flags: Record<string, FeatureFlagRecord | boolean>) {}

  private record(flag: string): FeatureFlagRecord | null {
    const v = this.flags[flag];
    if (v === undefined) return null;
    return typeof v === 'boolean' ? { key: flag, enabled: v } : v;
  }

  async isEnabled(flag: string, context?: FlagContext): Promise<boolean> {
    return evaluateFlag(this.record(flag), flag, context).enabled;
  }

  async getVariant(flag: string, context?: FlagContext): Promise<string | undefined> {
    const r = evaluateFlag(this.record(flag), flag, context);
    return r.enabled ? r.variant : undefined;
  }
}

/** Caches store lookups for `ttlMs` so hot paths don't hit the database on every check. */
export class CachedFeatureFlags implements FeatureFlagStore {
  private readonly cache = new Map<string, { value: FeatureFlagRecord | null; expires: number }>();

  constructor(
    private readonly store: FeatureFlagStore,
    private readonly ttlMs = 30_000,
  ) {}

  async get(key: string): Promise<FeatureFlagRecord | null> {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await this.store.get(key);
    this.cache.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }

  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}

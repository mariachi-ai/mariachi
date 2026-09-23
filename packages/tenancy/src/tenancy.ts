import type { Context, Logger, TracerAdapter, MetricsAdapter, Instrumentable } from '@mariachi/core';
import { TenancyError, createContext, resolveInstrumentation, runWithContext, type InstrumentationDeps } from '@mariachi/core';
import { createTenantResolver } from './resolver';
import type { TenancyConfig, TenantRecord, TenantResolver, TenantResolverInput, TenantStore } from './types';

/**
 * Tenant resolution and policy. The tenant in the caller's credentials is authoritative: a request
 * that names a different tenant is rejected with `tenancy/mismatch` unless `allowOverride` permits it.
 */
export abstract class Tenancy implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly resolver: TenantResolver;
  protected readonly config: TenancyConfig;
  private readonly cache = new Map<string, { record: TenantRecord | null; expiresAt: number }>();

  constructor(config: TenancyConfig & { resolver?: TenantResolver }, instrumentation?: InstrumentationDeps) {
    const resolved = resolveInstrumentation(instrumentation);
    this.logger = resolved.logger;
    this.tracer = resolved.tracer;
    this.metrics = resolved.metrics;
    this.config = config;
    this.resolver = config.resolver ?? createTenantResolver(config);
  }

  private get store(): TenantStore | undefined {
    return this.config.store;
  }

  /** Returns the tenant key named by the request, or null. Does not apply policy. */
  resolveKey(_ctx: Context, input: TenantResolverInput): string | null {
    const key = this.resolver.resolve(input);
    this.metrics?.increment(key ? 'tenancy.resolved' : 'tenancy.unresolved', 1);
    return key;
  }

  /** @deprecated use resolveKey */
  resolve(ctx: Context, input: TenantResolverInput): string | null {
    return this.resolveKey(ctx, input);
  }

  async lookup(key: string): Promise<TenantRecord | null> {
    if (!this.store) return { id: key, status: 'active' };
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.record;
    const record = await this.store.findByKey(key);
    this.cache.set(key, { record, expiresAt: Date.now() + (this.config.cacheTtlMs ?? 60_000) });
    return record;
  }

  invalidate(key?: string): void {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }

  private canOverride(ctx: Context): boolean {
    return this.config.allowOverride ? this.config.allowOverride(ctx) : ctx.identityType === 'service';
  }

  /**
   * Determines the effective tenant for `ctx` given the request, enforcing policy:
   * authenticated tenant wins; mismatches throw; the tenant must exist and be active.
   */
  async establish(ctx: Context, input: TenantResolverInput): Promise<TenantRecord | null> {
    const requested = this.resolveKey(ctx, input);
    const authenticated = ctx.tenantId;
    let key: string | null;
    if (authenticated && requested && requested !== authenticated) {
      const target = await this.lookup(requested);
      const sameTenant = target && (target.id === authenticated || target.slug === authenticated);
      if (!sameTenant && !this.canOverride(ctx)) {
        this.metrics?.increment('tenancy.mismatch', 1);
        throw new TenancyError('tenancy/mismatch', 'Requested tenant does not match authenticated tenant');
      }
      key = requested;
    } else {
      key = authenticated ?? requested;
    }
    if (!key) {
      if (this.config.required) throw new TenancyError('tenancy/missing-tenant', 'Tenant identification is required');
      return null;
    }
    const record = await this.lookup(key);
    if (!record || record.status === 'deleted') throw new TenancyError('tenancy/not-found', 'Tenant not found');
    if (record.status !== 'active') throw new TenancyError('tenancy/suspended', 'Tenant is not active', { status: record.status });
    return record;
  }

  /** Runs `fn` with a context scoped to `tenantId` (ambient context included). */
  async runAsTenant<T>(ctx: Context, tenantId: string, fn: (ctx: Context) => Promise<T>): Promise<T> {
    const record = await this.lookup(tenantId);
    if (!record || record.status !== 'active') throw new TenancyError('tenancy/not-found', 'Tenant not found or inactive');
    const scoped = createContext({ ...ctx, tenantId: record.id, logger: ctx.logger.child({ tenantId: record.id }) });
    return runWithContext(scoped, () => fn(scoped));
  }
}

export class DefaultTenancy extends Tenancy {}

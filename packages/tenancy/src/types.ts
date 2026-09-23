import type { Context } from '@mariachi/core';

export type TenantResolverStrategy = 'subdomain' | 'header' | 'jwt-claim' | 'path';

export interface TenantRecord {
  id: string;
  slug?: string;
  status: 'active' | 'suspended' | 'deleted' | (string & {});
  plan?: string;
  metadata?: Record<string, unknown>;
}

/** Looks up tenants by id or slug. Back it with the tenants table; results are cached. */
export interface TenantStore {
  findByKey(key: string): Promise<TenantRecord | null>;
}

export interface TenancyConfig {
  /** One strategy or an ordered list; the first that yields a key wins. */
  strategy: TenantResolverStrategy | TenantResolverStrategy[];
  headerName?: string;
  /** JWT claim for `jwt-claim`. Default `tenantId`. */
  claimName?: string;
  /** For `subdomain`: tenants are `<slug>.<baseDomain>`. Required for subdomain resolution. */
  baseDomain?: string;
  /** Subdomains never treated as tenants. Default www, api, app, admin. */
  reservedSubdomains?: string[];
  /** Path prefix before the tenant segment for `path`, e.g. `/t`. */
  pathPrefix?: string;
  required?: boolean;
  store?: TenantStore;
  /** Cache TTL for store lookups. Default 60s. */
  cacheTtlMs?: number;
  /**
   * Whether an authenticated caller may act in a tenant other than the one in its credentials.
   * Default: only `service` identities.
   */
  allowOverride?: (ctx: Context) => boolean;
}

export interface TenantResolverInput {
  hostname?: string;
  headers?: Record<string, string | string[] | undefined>;
  jwtClaims?: Record<string, unknown>;
  path?: string;
}

export interface TenantResolver {
  /** Returns the tenant key (id or slug) from the request, or null. */
  resolve(request: TenantResolverInput): string | null;
}

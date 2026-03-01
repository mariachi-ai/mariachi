export type TenantResolverStrategy = 'subdomain' | 'header' | 'jwt-claim' | 'path';

export interface TenancyConfig {
  strategy: TenantResolverStrategy;
  headerName?: string;
  required?: boolean;
}

export interface TenantResolver {
  resolve(request: TenantResolverInput): string | null;
}

export interface TenantResolverInput {
  hostname?: string;
  headers?: Record<string, string | undefined>;
  jwtClaims?: Record<string, unknown>;
  path?: string;
}

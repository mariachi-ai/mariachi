import type { TenancyConfig, TenantResolver, TenantResolverInput } from './types';

export function createTenantResolver(config: TenancyConfig): TenantResolver {
  return {
    resolve(request: TenantResolverInput): string | null {
      switch (config.strategy) {
        case 'subdomain': {
          const hostname = request.hostname ?? '';
          const parts = hostname.split('.');
          if (parts.length >= 2) {
            const subdomain = parts[0];
            return subdomain && subdomain !== 'www' ? subdomain : null;
          }
          return null;
        }
        case 'header': {
          const headerName = (config.headerName ?? 'x-tenant-id').toLowerCase();
          const headers = request.headers ?? {};
          const value =
            Object.entries(headers).find(([k]) => k.toLowerCase() === headerName)?.[1] ?? null;
          return typeof value === 'string' && value.length > 0 ? value : null;
        }
        case 'jwt-claim': {
          const tenantId = request.jwtClaims?.tenantId;
          return typeof tenantId === 'string' && tenantId.length > 0 ? tenantId : null;
        }
        case 'path': {
          const path = request.path ?? '';
          const segment = path.replace(/^\/+/, '').split('/')[0];
          return segment && segment.length > 0 ? segment : null;
        }
        default:
          return null;
      }
    },
  };
}

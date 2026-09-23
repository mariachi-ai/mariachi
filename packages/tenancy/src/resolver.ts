import { ConfigError } from '@mariachi/core';
import type { TenancyConfig, TenantResolver, TenantResolverInput, TenantResolverStrategy } from './types';

const TENANT_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DEFAULT_RESERVED = ['www', 'api', 'app', 'admin'];

function valid(key: string | null | undefined): string | null {
  return key && TENANT_KEY.test(key) ? key : null;
}

function one(strategy: TenantResolverStrategy, config: TenancyConfig, request: TenantResolverInput): string | null {
  switch (strategy) {
    case 'subdomain': {
      if (!config.baseDomain) throw new ConfigError('tenancy/config', 'subdomain strategy requires baseDomain');
      const host = (request.hostname ?? '').toLowerCase().split(':')[0];
      const suffix = `.${config.baseDomain.toLowerCase()}`;
      if (!host.endsWith(suffix)) return null;
      const label = host.slice(0, -suffix.length);
      if (!label || label.includes('.')) return null;
      if ((config.reservedSubdomains ?? DEFAULT_RESERVED).includes(label)) return null;
      return valid(label);
    }
    case 'header': {
      const name = (config.headerName ?? 'x-tenant-id').toLowerCase();
      const raw = Object.entries(request.headers ?? {}).find(([k]) => k.toLowerCase() === name)?.[1];
      return valid(Array.isArray(raw) ? raw[0] : raw);
    }
    case 'jwt-claim': {
      const v = request.jwtClaims?.[config.claimName ?? 'tenantId'];
      return typeof v === 'string' ? valid(v) : null;
    }
    case 'path': {
      let path = (request.path ?? '').split('?')[0];
      if (config.pathPrefix) {
        const prefix = `/${config.pathPrefix.replace(/^\/+|\/+$/g, '')}/`;
        if (!path.startsWith(prefix)) return null;
        path = path.slice(prefix.length);
      }
      return valid(path.replace(/^\/+/, '').split('/')[0]);
    }
    default:
      return null;
  }
}

export function createTenantResolver(config: TenancyConfig): TenantResolver {
  const strategies = Array.isArray(config.strategy) ? config.strategy : [config.strategy];
  return {
    resolve(request) {
      for (const s of strategies) {
        const key = one(s, config, request);
        if (key) return key;
      }
      return null;
    },
  };
}

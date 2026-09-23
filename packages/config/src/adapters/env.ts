import type { SecretsAdapter } from '../types';

function envKey(key: string, tenantId?: string): string {
  return tenantId ? `TENANT_${tenantId.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_${key}` : key;
}

/**
 * Reads secrets from environment variables. Tenant-scoped secrets use `TENANT_<ID>_<KEY>`.
 * `set()` stores values in memory only; it never mutates `process.env`.
 */
export class EnvSecretsAdapter implements SecretsAdapter {
  private readonly overrides = new Map<string, string>();

  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  async get(key: string, tenantId?: string): Promise<string | undefined> {
    const k = envKey(key, tenantId);
    return this.overrides.get(k) ?? this.env[k];
  }

  async set(key: string, value: string, tenantId?: string): Promise<void> {
    this.overrides.set(envKey(key, tenantId), value);
  }
}

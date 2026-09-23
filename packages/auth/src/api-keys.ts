import { AuthError, type Context } from '@mariachi/core';
import { createApiKey, hashApiKey, type GeneratedApiKey } from './adapters/api-key';
import type { ResolvedIdentity } from './types';

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  hashedKey: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  expiresAt?: Date | null;
  rotatedFromId?: string | null;
  revokedAt?: Date | null;
}

export interface ApiKeyStore {
  insert(record: ApiKeyRecord): Promise<void>;
  findByHash(hashedKey: string): Promise<ApiKeyRecord | null>;
  findById(id: string): Promise<ApiKeyRecord | null>;
  revoke(id: string, at: Date): Promise<void>;
  touch(id: string, at: Date): Promise<void>;
}

export class MemoryApiKeyStore implements ApiKeyStore {
  readonly records: ApiKeyRecord[] = [];

  async insert(record: ApiKeyRecord): Promise<void> {
    this.records.push(record);
  }

  async findByHash(hashedKey: string): Promise<ApiKeyRecord | null> {
    return this.records.find((r) => r.hashedKey === hashedKey) ?? null;
  }

  async findById(id: string): Promise<ApiKeyRecord | null> {
    return this.records.find((r) => r.id === id) ?? null;
  }

  async revoke(id: string, at: Date): Promise<void> {
    const record = await this.findById(id);
    if (!record) return;
    record.active = false;
    record.revokedAt = at;
  }

  async touch(id: string, at: Date): Promise<void> {
    const record = await this.findById(id);
    if (record) (record as ApiKeyRecord & { lastUsedAt?: Date }).lastUsedAt = at;
  }
}

/**
 * Issues, verifies and rotates tenant API keys. Only the hash is stored.
 * Rotation revokes the old key and returns a new secret with the same scopes.
 */
export class ApiKeyService {
  constructor(private readonly store: ApiKeyStore) {}

  async issue(ctx: Context, input: { name: string; scopes: string[]; userId?: string; expiresAt?: Date; env?: string }): Promise<GeneratedApiKey & { id: string }> {
    if (!ctx.tenantId) throw new AuthError('auth/tenant-required', 'API keys require ctx.tenantId');
    const generated = createApiKey(input.env ?? 'live');
    const id = crypto.randomUUID();
    await this.store.insert({
      id,
      tenantId: ctx.tenantId,
      userId: input.userId ?? ctx.userId ?? '',
      name: input.name,
      hashedKey: generated.hashedKey,
      prefix: generated.prefix,
      scopes: input.scopes,
      active: true,
      expiresAt: input.expiresAt ?? null,
    });
    return { ...generated, id };
  }

  async rotate(ctx: Context, id: string): Promise<GeneratedApiKey & { id: string }> {
    const current = await this.requireOwned(ctx, id);
    const generated = createApiKey(current.prefix.split('_')[1] ?? 'live');
    const nextId = crypto.randomUUID();
    await this.store.insert({
      ...current,
      id: nextId,
      hashedKey: generated.hashedKey,
      prefix: generated.prefix,
      active: true,
      rotatedFromId: current.id,
      revokedAt: null,
    });
    // Revoke only after the replacement exists, so a failed insert never leaves the tenant keyless.
    await this.store.revoke(current.id, new Date());
    return { ...generated, id: nextId };
  }

  async revoke(ctx: Context, id: string): Promise<void> {
    await this.requireOwned(ctx, id);
    await this.store.revoke(id, new Date());
  }

  async verify(token: string): Promise<ResolvedIdentity> {
    const record = await this.store.findByHash(hashApiKey(token));
    if (!record || !record.active) throw new AuthError('auth/invalid-api-key', 'Invalid API key');
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) throw new AuthError('auth/invalid-api-key', 'API key expired');
    await this.store.touch(record.id, new Date());
    return {
      userId: record.userId,
      tenantId: record.tenantId,
      scopes: record.scopes,
      identityType: 'api-key',
      apiKeyId: record.id,
    };
  }

  private async requireOwned(ctx: Context, id: string): Promise<ApiKeyRecord> {
    const record = await this.store.findById(id);
    if (!record || (ctx.tenantId && record.tenantId !== ctx.tenantId)) {
      throw new AuthError('auth/api-key-not-found', `API key ${id} not found`);
    }
    return record;
  }
}

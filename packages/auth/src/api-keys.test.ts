import { describe, expect, it } from 'vitest';
import { createContext } from '@mariachi/core';
import { InMemoryRoleStore } from './authorization/rbac';
import { CachedRoleStore } from './authorization/cache';
import { ApiKeyService, MemoryApiKeyStore } from './api-keys';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

describe('ApiKeyService', () => {
  it('issues, verifies scopes, and rotates', async () => {
    const service = new ApiKeyService(new MemoryApiKeyStore());
    const ctx = createContext({ logger: silent, tenantId: 't1', userId: 'u1' });
    const issued = await service.issue(ctx, { name: 'ci', scopes: ['read:users'] });
    expect((await service.verify(issued.key)).scopes).toEqual(['read:users']);
    const rotated = await service.rotate(ctx, issued.id);
    await expect(service.verify(issued.key)).rejects.toMatchObject({ code: 'auth/invalid-api-key' });
    expect((await service.verify(rotated.key)).apiKeyId).toBe(rotated.id);
  });
});

describe('CachedRoleStore', () => {
  it('serves roles from cache until a grant invalidates it', async () => {
    const inner = new InMemoryRoleStore();
    let reads = 0;
    const cache = new Map<string, string>();
    const store = new CachedRoleStore(inner, {
      async get(key) { reads += 1; return cache.get(key) ?? null; },
      async set(key, value) { cache.set(key, value); },
      async del(key) { cache.delete(key); },
    });
    await store.grant('u1', 'admin', 't1');
    expect(await store.getRoles('u1', 't1')).toEqual(['admin']);
    expect(await store.getRoles('u1', 't1')).toEqual(['admin']);
    expect(reads).toBe(2);
    await store.revoke('u1', 'admin', 't1');
    expect(await store.getRoles('u1', 't1')).toEqual([]);
  });
});

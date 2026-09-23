import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContext } from '@mariachi/core';
import { applySchema, createPostgresDatabase, type PostgresDatabase } from '@mariachi/database-postgres';
import { startPostgres, stopAll } from '../../../../test/setup';
import { ApiKeyService } from '../api-keys';
import { RBACAdapter } from '../authorization/rbac';
import { apiKeysTable, authWebhookDedupTable, rolesTable, userRolesTable } from '../schema/index';
import type { ResolvedIdentity } from '../types';
import { DrizzleApiKeyStore, DrizzleRoleStore, DrizzleWebhookDedup } from './index';

const run = crypto.randomUUID().slice(0, 8);
const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };
let database: PostgresDatabase;

beforeAll(async () => {
  database = createPostgresDatabase({ url: await startPostgres() });
  await database.connect();
  await applySchema(database.db, [rolesTable, userRolesTable, apiKeysTable, authWebhookDedupTable]);
}, 180_000);

afterAll(async () => {
  await database?.disconnect();
  await stopAll();
});

describe('DB-backed RBAC', () => {
  it('reads role permissions from the roles table', async () => {
    const store = new DrizzleRoleStore(database.db);
    await store.defineRole(`editor_${run}`, [{ action: 'update', resource: 'posts' }]);
    await store.grant('u1', `editor_${run}`, 't1');
    const rbac = new RBACAdapter({ store, permissionSource: store });
    const user: ResolvedIdentity = { userId: 'u1', tenantId: 't1', scopes: [], identityType: 'session' };

    expect(await rbac.can(user, 'update', 'posts')).toBe(true);
    expect(await rbac.can(user, 'delete', 'posts')).toBe(false);
    expect(await rbac.can({ ...user, tenantId: 't2' }, 'update', 'posts')).toBe(false);

    await store.defineRole(`editor_${run}`, [{ action: '*', resource: 'posts' }]);
    await rbac.refreshPermissions();
    expect(await rbac.can(user, 'delete', 'posts')).toBe(true);
  });
});

describe('DrizzleApiKeyStore', () => {
  it('persists issue, rotate and revoke', async () => {
    const service = new ApiKeyService(new DrizzleApiKeyStore(database.db));
    const ctx = createContext({ logger: silent, tenantId: 't1', userId: 'u1' });
    const issued = await service.issue(ctx, { name: 'ci', scopes: ['read:users'] });
    expect(await service.verify(issued.key)).toMatchObject({ userId: 'u1', tenantId: 't1', scopes: ['read:users'] });

    const rotated = await service.rotate(ctx, issued.id);
    await expect(service.verify(issued.key)).rejects.toMatchObject({ code: 'auth/invalid-api-key' });
    expect((await service.verify(rotated.key)).apiKeyId).toBe(rotated.id);

    await expect(service.revoke(createContext({ logger: silent, tenantId: 't2' }), rotated.id)).rejects.toMatchObject({
      code: 'auth/api-key-not-found',
    });
  });
});

describe('DrizzleWebhookDedup', () => {
  it('lets exactly one concurrent claim win', async () => {
    const dedup = new DrizzleWebhookDedup(database.db);
    const claims = await Promise.all(Array.from({ length: 8 }, () => dedup.claim(`evt_1_${run}`, 60_000)));
    expect(claims.filter((c) => c === 'claimed')).toHaveLength(1);
    await dedup.complete(`evt_1_${run}`, 60_000);
    expect(await dedup.claim(`evt_1_${run}`, 60_000)).toBe('completed');
  });

  it('reclaims an expired claim', async () => {
    const dedup = new DrizzleWebhookDedup(database.db);
    expect(await dedup.claim(`evt_2_${run}`, 1)).toBe('claimed');
    await new Promise((r) => setTimeout(r, 10));
    expect(await dedup.claim(`evt_2_${run}`, 60_000)).toBe('claimed');
  });
});

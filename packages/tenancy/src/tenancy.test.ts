import { describe, expect, it } from 'vitest';
import { createContext } from '@mariachi/core';
import { createTenancy, createTenantResolver } from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

describe('tenancy', () => {
  it('only resolves subdomains under baseDomain and skips reserved labels', () => {
    const r = createTenantResolver({ strategy: 'subdomain', baseDomain: 'example.com' });
    expect(r.resolve({ hostname: 'acme.example.com' })).toBe('acme');
    expect(r.resolve({ hostname: 'api.example.com' })).toBeNull();
    expect(r.resolve({ hostname: 'a.b.example.com' })).toBeNull();
    expect(r.resolve({ hostname: 'acme.evil.com' })).toBeNull();
  });

  it('rejects a header tenant that differs from the authenticated tenant', async () => {
    const t = createTenancy({ strategy: 'header' }, { logger: silent });
    const user = createContext({ logger: silent, tenantId: 't1', identityType: 'session' });
    await expect(t.establish(user, { headers: { 'x-tenant-id': 't2' } })).rejects.toMatchObject({ code: 'tenancy/mismatch' });
    const service = createContext({ logger: silent, tenantId: 't1', identityType: 'service' });
    expect((await t.establish(service, { headers: { 'x-tenant-id': 't2' } }))?.id).toBe('t2');
  });

  it('rejects suspended and unknown tenants', async () => {
    const t = createTenancy(
      {
        strategy: 'header',
        store: { findByKey: async (k) => (k === 'sus' ? { id: 'sus', status: 'suspended' } : k === 'ok' ? { id: 'ok', status: 'active' } : null) },
      },
      { logger: silent },
    );
    const anon = createContext({ logger: silent });
    await expect(t.establish(anon, { headers: { 'x-tenant-id': 'sus' } })).rejects.toMatchObject({ code: 'tenancy/suspended' });
    await expect(t.establish(anon, { headers: { 'x-tenant-id': 'nope' } })).rejects.toMatchObject({ code: 'tenancy/not-found' });
    expect((await t.establish(anon, { headers: { 'x-tenant-id': 'ok' } }))?.id).toBe('ok');
  });
});

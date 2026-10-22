import { describe, expect, it } from 'vitest';
import { AuthError, createContext, type Context } from '@mariachi/core';
import { createAuthMiddleware, type AuthenticationAdapter, type ResolvedIdentity } from '@mariachi/auth';
import { bearerStrategy, createApiServer, type HttpContext } from '@mariachi/api-facade';
import { createTenancy, createTenancyMiddleware, createTenantResolver, type TenancyContext } from './index';

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

describe('jwt-claim tenancy', () => {
  // What @mariachi/auth-gotrue returns for a token whose access-token hook added the org claims.
  const identity = (claims: Record<string, unknown>): ResolvedIdentity => ({
    userId: 'u1',
    tenantId: typeof claims.org_id === 'string' ? claims.org_id : '',
    scopes: ['authenticated'],
    roles: ['authenticated'],
    identityType: 'session',
    claims,
  });

  it('resolves the tenant from a named claim', () => {
    const r = createTenantResolver({ strategy: 'jwt-claim', claimName: 'org_id' });
    expect(r.resolve({ jwtClaims: { org_id: 'org-acme' } })).toBe('org-acme');
    expect(r.resolve({ jwtClaims: { org_id: 7 } })).toBeNull();
    expect(r.resolve({ jwtClaims: { org_id: '../evil' } })).toBeNull();
    expect(r.resolve({})).toBeNull();
  });

  it('reads the claims createAuthMiddleware passes on (ctx.jwtClaims)', async () => {
    const run = async (verified: ResolvedIdentity) => {
      const adapter: AuthenticationAdapter = { verify: async () => verified, sign: async () => 'unused' };
      const auth = createAuthMiddleware(adapter, { getToken: () => 't' });
      const tenancy = createTenancyMiddleware(createTenancy({ strategy: 'jwt-claim', claimName: 'org_id', required: true }, { logger: silent }));
      const ctx = createContext({ logger: silent }) as TenancyContext;
      let seen: Context | null = null;
      await auth(ctx, () =>
        tenancy(ctx, async () => {
          seen = ctx;
        }),
      );
      return { ctx, seen };
    };
    const { ctx, seen } = await run(identity({ sub: 'u1', org_id: 'org-acme', org_role: 'admin' }));
    expect(seen).not.toBeNull();
    expect(ctx.tenantId).toBe('org-acme');
    expect(ctx.tenant).toEqual({ id: 'org-acme', status: 'active' });
    // The claim is read, not ignored: one that disagrees with the identity's tenant is refused.
    await expect(run({ ...identity({ sub: 'u1', org_id: 'org-other' }), tenantId: 'org-acme' })).rejects.toMatchObject({
      code: 'tenancy/mismatch',
    });
  });

  it('reads ctx.identity.claims on an api-facade request, and still fails closed on a mismatch', async () => {
    const tokens: Record<string, ResolvedIdentity> = {
      acme: identity({ sub: 'u1', org_id: 'org-acme', org_role: 'admin' }),
      // A token whose identity tenant and org claim disagree must never pick either silently.
      forged: { ...identity({ sub: 'u1', org_id: 'org-other' }), tenantId: 'org-acme' },
    };
    const verifier = {
      verify: async (token: string) => {
        const id = tokens[token];
        if (!id) throw new AuthError('auth/invalid-token', 'bad');
        return id;
      },
    };
    const tenancy = createTenancy(
      {
        strategy: 'jwt-claim',
        claimName: 'org_id',
        store: { findByKey: async (k) => (k === 'org-acme' || k === 'org-other' ? { id: k, slug: k, status: 'active' } : null) },
      },
      { logger: silent },
    );
    const s = createApiServer({ name: 'tenancy', logger: silent })
      .withAuthStrategy('session', bearerStrategy(verifier))
      .withAuth('session')
      .withMiddleware(createTenancyMiddleware(tenancy))
      .register([
        {
          method: 'GET',
          path: '/whoami',
          handler: async (ctx: HttpContext) => ({ tenantId: ctx.tenantId, tenant: (ctx as HttpContext & TenancyContext).tenant?.id }),
        },
        { method: 'GET', path: '/public', auth: false, handler: async (ctx: HttpContext) => ({ tenantId: ctx.tenantId }) },
      ]);
    const ok = await s.inject({ method: 'GET', url: '/whoami', headers: { authorization: 'Bearer acme' } });
    expect(ok.json()).toEqual({ tenantId: 'org-acme', tenant: 'org-acme' });
    const forged = await s.inject({ method: 'GET', url: '/whoami', headers: { authorization: 'Bearer forged' } });
    expect(forged.statusCode).toBe(403);
    expect(forged.json<{ error: { code: string } }>().error.code).toBe('tenancy/mismatch');
    // No identity, no claims: an optional tenancy lets public routes through without a tenant.
    expect((await s.inject({ method: 'GET', url: '/public' })).json()).toEqual({ tenantId: null });
  });

  it('prefers ctx.jwtClaims over ctx.identity.claims, and resolves nothing from a context without either', async () => {
    const tenancy = createTenancy({ strategy: 'jwt-claim', claimName: 'org_id' }, { logger: silent });
    const mw = createTenancyMiddleware(tenancy);
    const both = Object.assign(createContext({ logger: silent }), {
      jwtClaims: { org_id: 'from-middleware' },
      identity: { claims: { org_id: 'from-identity' } },
    }) as TenancyContext;
    await mw(both, async () => {});
    expect(both.tenantId).toBe('from-middleware');
    const none = createContext({ logger: silent }) as TenancyContext;
    await mw(none, async () => {});
    expect(none.tenantId).toBeNull();
  });
});

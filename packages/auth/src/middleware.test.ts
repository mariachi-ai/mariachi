import { describe, expect, it } from 'vitest';
import { AuthError, createContext } from '@mariachi/core';
import { createAuthMiddleware, type AuthenticatedContext } from './index';
import type { AuthenticationAdapter, ResolvedIdentity } from './types';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

function adapter(identity: ResolvedIdentity): AuthenticationAdapter {
  return {
    async verify(token) {
      if (token !== 'good') throw new AuthError('auth/invalid-token', 'bad');
      return identity;
    },
    async sign() {
      return 'unused';
    },
  };
}

const withToken = (token?: string) => Object.assign(createContext({ logger: silent }), { token }) as AuthenticatedContext;

describe('createAuthMiddleware', () => {
  it("sets the identity on the context and passes the provider's claims on as ctx.jwtClaims", async () => {
    const claims = { sub: 'u1', org_id: 'org-acme', org_role: 'admin', app_metadata: { persona: 'admin' }, act: { sub: 'reviewer' } };
    const mw = createAuthMiddleware(
      adapter({ userId: 'u1', tenantId: 'org-acme', scopes: ['admin'], roles: ['admin'], identityType: 'session', sessionId: 's1', claims }),
    );
    const ctx = withToken('good');
    let reached = false;
    await mw(ctx, async () => {
      reached = true;
    });
    expect(reached).toBe(true);
    expect(ctx).toMatchObject({ userId: 'u1', tenantId: 'org-acme', scopes: ['admin'], identityType: 'session', sessionId: 's1' });
    expect(ctx.jwtClaims).toEqual(claims);
  });

  it('leaves jwtClaims unset for an adapter that returns no claims (API keys)', async () => {
    const ctx = withToken('good');
    await createAuthMiddleware(adapter({ userId: 'u1', tenantId: 't1', scopes: [], identityType: 'api-key', apiKeyId: 'k1' }))(ctx, async () => {});
    expect(ctx.jwtClaims).toBeUndefined();
    expect(ctx.apiKeyId).toBe('k1');
  });

  it('rejects a missing or invalid token before next runs', async () => {
    const mw = createAuthMiddleware(adapter({ userId: 'u1', tenantId: 't1', scopes: [], identityType: 'session' }));
    let reached = false;
    const next = async () => {
      reached = true;
    };
    await expect(mw(withToken(), next)).rejects.toMatchObject({ code: 'auth/unauthorized' });
    await expect(mw(withToken('nope'), next)).rejects.toMatchObject({ code: 'auth/invalid-token' });
    expect(reached).toBe(false);
  });
});

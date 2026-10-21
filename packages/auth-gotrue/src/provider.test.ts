import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { GoTrueAuthProvider } from './provider';
import { createGoTrueAuth } from './index';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
type Key = { kid: string; privateKey: PrivateKey; jwk: JWK };

async function makeKey(kid: string, alg: 'ES256' | 'RS256' = 'ES256'): Promise<Key> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid, alg, use: 'sig', key_ops: ['verify'] };
  return { kid, privateKey, jwk };
}

// A stand-in for GoTrue's /auth/v1/.well-known/jwks.json, whose key set the tests swap.
let server: Server;
let base: string;
let published: JWK[] = [];
let jwksHits = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      jwksHits += 1;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: published }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/v1`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

async function sign(key: Key, claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string | number; alg?: string } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: opts.alg ?? 'ES256', kid: key.kid, typ: 'JWT' })
    .setIssuer(opts.iss ?? base)
    .setAudience(opts.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(key.privateKey);
}

// What GoTrue v2.197.0 puts in an access token (reports/AU0/03-04), plus a hook's org claims.
const gotrueClaims = (over: Record<string, unknown> = {}) => ({
  sub: '594ff93a-cb07-4b26-ad54-2c9594aee06e',
  email: 'admin@seed.test',
  phone: '',
  app_metadata: { persona: 'admin', provider: 'email', providers: ['email'] },
  user_metadata: { email_verified: true },
  role: 'authenticated',
  aal: 'aal1',
  amr: [{ method: 'password', timestamp: 1792582414 }],
  session_id: '398da062-6f09-4eaf-88af-7765a0d4aee5',
  is_anonymous: false,
  ...over,
});

describe('GoTrueAuthProvider.verify', () => {
  it('verifies an ES256 token through the remote JWKS and maps GoTrue claims onto the identity', async () => {
    const key = await makeKey('k1');
    published = [key.jwk];
    const provider = createGoTrueAuth({ url: base });
    const token = await sign(key, gotrueClaims({ org_id: 'org-acme', org_role: 'owner', act: { sub: 'reviewer-1' } }));
    const id = await provider.verify(token);
    expect(id).toMatchObject({
      userId: '594ff93a-cb07-4b26-ad54-2c9594aee06e',
      tenantId: 'org-acme',
      sessionId: '398da062-6f09-4eaf-88af-7765a0d4aee5',
      identityType: 'session',
      roles: ['authenticated', 'owner'],
      scopes: ['authenticated', 'owner'],
    });
    expect(id.claims).toMatchObject({
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: 1792582414 }],
      act: { sub: 'reviewer-1' },
      is_anonymous: false,
      iss: base,
    });
    expect(provider.name).toBe('gotrue');
  });

  it('leaves tenantId empty without the org claim, and reads a custom org claim and roles/scope', async () => {
    const key = await makeKey('k2');
    published = [key.jwk];
    expect((await createGoTrueAuth({ url: base }).verify(await sign(key, gotrueClaims()))).tenantId).toBe('');
    const provider = createGoTrueAuth({ url: `${base}/`, orgClaim: 'tenant', orgRoleClaim: 'tenant_role' });
    const id = await provider.verify(
      await sign(key, gotrueClaims({ tenant: 't-9', tenant_role: 'admin', roles: ['billing', 'admin', 7], scope: 'openid email' })),
    );
    expect(id.tenantId).toBe('t-9');
    expect(id.roles).toEqual(['authenticated', 'billing', 'admin']);
    expect(id.scopes).toEqual(['authenticated', 'billing', 'admin', 'openid', 'email']);
  });

  it('refuses a wrong issuer, a token without one, a wrong audience, and an expired token', async () => {
    const key = await makeKey('k3');
    published = [key.jwk];
    const provider = createGoTrueAuth({ url: base });
    await expect(provider.verify(await sign(key, gotrueClaims(), { iss: 'https://other.example/auth/v1' }))).rejects.toMatchObject({ code: 'auth/invalid-token' });
    const noIss = await new SignJWT(gotrueClaims())
      .setProtectedHeader({ alg: 'ES256', kid: key.kid })
      .setAudience('authenticated')
      .setExpirationTime('10m')
      .sign(key.privateKey);
    await expect(provider.verify(noIss)).rejects.toMatchObject({ code: 'auth/invalid-token' });
    await expect(provider.verify(await sign(key, gotrueClaims(), { aud: 'anon' }))).rejects.toMatchObject({ code: 'auth/invalid-token' });
    await expect(provider.verify(await sign(key, gotrueClaims(), { exp: Math.floor(Date.now() / 1000) - 60 }))).rejects.toMatchObject({
      code: 'auth/invalid-token',
    });
    // An explicit issuer and audience are honoured.
    const custom = createGoTrueAuth({ url: base, issuer: 'https://app.example/auth/v1', audience: ['authenticated', 'anon'] });
    await expect(custom.verify(await sign(key, gotrueClaims(), { iss: 'https://app.example/auth/v1', aud: 'anon' }))).resolves.toBeTruthy();
  });

  it('refuses a tampered signature, an unknown kid, a token without sub, and an HS256 token', async () => {
    const key = await makeKey('k4');
    const stranger = await makeKey('k4-stranger');
    published = [key.jwk];
    const provider = createGoTrueAuth({ url: base });
    const good = await sign(key, gotrueClaims());
    const tampered = `${good.slice(0, -6)}AAAAAA`;
    await expect(provider.verify(tampered)).rejects.toMatchObject({ code: 'auth/invalid-token' });
    await expect(provider.verify(await sign(stranger, gotrueClaims()))).rejects.toMatchObject({ code: 'auth/invalid-token' });
    const { sub: _sub, ...noSub } = gotrueClaims();
    await expect(provider.verify(await sign(key, noSub))).rejects.toMatchObject({ code: 'auth/invalid-token' });
    const hs = await new SignJWT(gotrueClaims())
      .setProtectedHeader({ alg: 'HS256', kid: key.kid })
      .setIssuer(base)
      .setAudience('authenticated')
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('a-shared-secret-that-must-never-verify'));
    await expect(provider.verify(hs)).rejects.toMatchObject({ code: 'auth/invalid-token' });
  });

  it('accepts only the configured algorithms and never an HMAC one', async () => {
    const rsa = await makeKey('k5-rsa', 'RS256');
    published = [rsa.jwk];
    const token = await sign(rsa, gotrueClaims(), { alg: 'RS256' });
    await expect(createGoTrueAuth({ url: base }).verify(token)).rejects.toMatchObject({ code: 'auth/invalid-token' });
    await expect(createGoTrueAuth({ url: base, algorithms: ['RS256'] }).verify(token)).resolves.toMatchObject({ userId: gotrueClaims().sub });
    expect(() => createGoTrueAuth({ url: base, algorithms: ['HS256' as never] })).toThrow(/HMAC/);
    expect(() => createGoTrueAuth({ url: '' })).toThrow(/url/);
  });

  it('stops trusting a rotated-out key once the cached JWKS expires (the fork case)', async () => {
    const a = await makeKey('fork-a');
    const b = await makeKey('fork-b');
    published = [a.jwk];
    const provider = new GoTrueAuthProvider({ url: base, jwksCacheMaxAgeMs: 50, jwksCooldownMs: 0 });
    const tokenA = await sign(a, gotrueClaims());
    await expect(provider.verify(tokenA)).resolves.toBeTruthy();
    // The child's GoTrue now publishes only key B.
    published = [b.jwk];
    await new Promise((r) => setTimeout(r, 80));
    const before = jwksHits;
    await expect(provider.verify(tokenA)).rejects.toMatchObject({ code: 'auth/invalid-token' });
    expect(jwksHits).toBeGreaterThan(before);
    await expect(provider.verify(await sign(b, gotrueClaims()))).resolves.toBeTruthy();
  });

  it('uses <url>/.well-known/jwks.json, or jwksUrl when given', async () => {
    const key = await makeKey('k6');
    published = [key.jwk];
    const hits = jwksHits;
    const provider = createGoTrueAuth({ url: 'https://public.example/auth/v1', jwksUrl: `${base}/.well-known/jwks.json`, issuer: base });
    await expect(provider.verify(await sign(key, gotrueClaims()))).resolves.toBeTruthy();
    expect(jwksHits).toBeGreaterThan(hits);
  });
});

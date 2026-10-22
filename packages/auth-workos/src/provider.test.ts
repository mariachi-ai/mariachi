import { describe, expect, it, beforeAll } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { WorkOSAuthProvider } from './provider';
import { createWorkOSAuth } from './index';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
type Key = { kid: string; privateKey: PrivateKey; jwk: JWK };

const CLIENT_ID = 'client_01TESTCLIENT';
const ISSUER = `https://api.workos.com/user_management/${CLIENT_ID}`;

async function makeKey(kid: string, alg: 'RS256' | 'ES256' = 'RS256'): Promise<Key> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  return { kid, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg, use: 'sig' } };
}

// What an AuthKit session token carries (observed on WorkOS staging, 2026-10-22), plus org claims.
const sessionClaims = (over: Record<string, unknown> = {}) => ({
  sub: 'user_01K0EXAMPLE',
  sid: 'session_01K0EXAMPLE',
  jti: '01K0EXAMPLEJTI',
  client_id: CLIENT_ID,
  auth_time: 1792656527,
  ...over,
});

async function sign(
  key: Key,
  claims: Record<string, unknown>,
  opts: { iss?: string; aud?: string; exp?: string | number; alg?: string } = {},
): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: opts.alg ?? 'RS256', kid: key.kid })
    .setIssuer(opts.iss ?? ISSUER)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m');
  if (opts.aud) jwt.setAudience(opts.aud);
  return jwt.sign(key.privateKey);
}

let key: Key;
let other: Key;
let provider: WorkOSAuthProvider;

beforeAll(async () => {
  key = await makeKey('sso_oidc_key_pair_TEST');
  other = await makeKey('sso_oidc_key_pair_OTHER');
  provider = new WorkOSAuthProvider({ clientId: CLIENT_ID }, createLocalJWKSet({ keys: [key.jwk] }));
});

describe('WorkOSAuthProvider.verify', () => {
  it('maps an AuthKit session token onto ResolvedIdentity', async () => {
    const token = await sign(
      key,
      sessionClaims({ org_id: 'org_01ACME', role: 'admin', roles: ['admin', 'billing'], permissions: ['projects:read', 'projects:write'] }),
    );
    const identity = await provider.verify(token);
    expect(identity).toMatchObject({
      userId: 'user_01K0EXAMPLE',
      sessionId: 'session_01K0EXAMPLE',
      tenantId: 'org_01ACME',
      roles: ['admin', 'billing'],
      scopes: ['projects:read', 'projects:write'],
      identityType: 'session',
    });
    expect(identity.claims?.client_id).toBe(CLIENT_ID);
  });

  it('gives an empty tenant and no roles to a user outside any organization', async () => {
    const identity = await provider.verify(await sign(key, sessionClaims()));
    expect(identity.tenantId).toBe('');
    expect(identity.roles).toEqual([]);
    expect(identity.scopes).toEqual([]);
  });

  it('keeps `act` (impersonation, a claimed agent) in claims', async () => {
    const identity = await provider.verify(await sign(key, sessionClaims({ act: { sub: 'admin@workos.com' } })));
    expect(identity.claims?.act).toEqual({ sub: 'admin@workos.com' });
  });

  it.each([
    ['another issuer', { iss: 'https://api.workos.com/user_management/client_OTHER' }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 60 }],
  ])('refuses %s', async (_name, opts) => {
    await expect(provider.verify(await sign(key, sessionClaims(), opts))).rejects.toMatchObject({ code: 'auth/invalid-token' });
  });

  it('refuses a token signed with a key outside the JWKS', async () => {
    const forged = await sign({ ...other, kid: key.kid }, sessionClaims());
    await expect(provider.verify(forged)).rejects.toMatchObject({ code: 'auth/invalid-token' });
  });

  it('refuses a token issued for another client', async () => {
    const token = await sign(key, sessionClaims({ client_id: 'client_OTHER' }));
    await expect(provider.verify(token)).rejects.toMatchObject({ code: 'auth/invalid-token' });
  });

  it('refuses alg none and an HMAC token', async () => {
    const [, payload] = (await sign(key, sessionClaims())).split('.');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: key.kid })).toString('base64url')}.${payload}.`;
    await expect(provider.verify(none)).rejects.toMatchObject({ code: 'auth/invalid-token' });

    const hmac = await new SignJWT(sessionClaims())
      .setProtectedHeader({ alg: 'HS256', kid: key.kid })
      .setIssuer(ISSUER)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('guessed-secret-guessed-secret-guessed'));
    await expect(provider.verify(hmac)).rejects.toMatchObject({ code: 'auth/invalid-token' });
  });

  it('refuses a token without a subject', async () => {
    const token = await sign(key, { sid: 'session_x', client_id: CLIENT_ID });
    await expect(provider.verify(token)).rejects.toMatchObject({ code: 'auth/invalid-token' });
  });
});

describe('OAuth-server tokens (MCP)', () => {
  const AUTHKIT = 'https://ensemble-staging.authkit.app';
  const RESOURCE = 'https://app.example.com/mcp';
  let mcp: WorkOSAuthProvider;

  beforeAll(() => {
    mcp = new WorkOSAuthProvider(
      { clientId: CLIENT_ID, issuer: AUTHKIT, audience: RESOURCE, requireClientId: false },
      createLocalJWKSet({ keys: [key.jwk] }),
    );
  });

  it('accepts a token for the resource, whatever OAuth client it was issued to', async () => {
    const token = await sign(key, { sub: 'user_01K0EXAMPLE', client_id: 'client_MCP_DCR', scope: 'openid mcp:tools' }, { iss: AUTHKIT, aud: RESOURCE });
    const identity = await mcp.verify(token);
    expect(identity.userId).toBe('user_01K0EXAMPLE');
    expect(identity.scopes).toEqual(['openid', 'mcp:tools']);
  });

  it('refuses a token for another resource, or none', async () => {
    const elsewhere = await sign(key, { sub: 'user_01K0EXAMPLE' }, { iss: AUTHKIT, aud: 'https://other.example.com/mcp' });
    await expect(mcp.verify(elsewhere)).rejects.toMatchObject({ code: 'auth/invalid-token' });
    const session = await sign(key, sessionClaims(), { iss: AUTHKIT });
    await expect(mcp.verify(session)).rejects.toMatchObject({ code: 'auth/invalid-token' });
  });
});

describe('configuration', () => {
  it('requires a client id and refuses HMAC algorithms', () => {
    expect(() => createWorkOSAuth({ clientId: '' })).toThrow(/clientId/);
    expect(() => createWorkOSAuth({ clientId: CLIENT_ID, algorithms: ['HS256' as never] })).toThrow(/HMAC/);
  });

  it('creates a webhook handler from the endpoint secret', () => {
    expect(provider.createWebhookHandler({ secret: 'whsec' })).toBeDefined();
    expect(provider.name).toBe('workos');
  });
});

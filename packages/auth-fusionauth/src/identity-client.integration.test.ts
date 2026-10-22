import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import { createFusionAuthIdentityClient, type FusionAuthIdentityClient } from './index';

/**
 * Against a real FusionAuth (`FUSIONAUTH_IMAGE`, default `fusionauth/fusionauth-app:latest`) on
 * Postgres, with database search and a kickstart API key, started with Testcontainers.
 */
const IMAGE = process.env.FUSIONAUTH_IMAGE ?? 'fusionauth/fusionauth-app:latest';
const API_KEY = randomBytes(24).toString('hex');
const started: StartedTestContainer[] = [];
let network: StartedNetwork;
let base: string;
let client: FusionAuthIdentityClient;

async function fa<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: API_KEY, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (res.status >= 300) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

beforeAll(async () => {
  const { GenericContainer, Network, Wait } = await import('testcontainers');
  network = await new Network().start();
  started.push(
    await new GenericContainer('postgres:17-alpine')
      .withNetwork(network)
      .withNetworkAliases('pg')
      .withEnvironment({ POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: 'pg' })
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start(),
  );
  const app = await new GenericContainer(IMAGE)
    .withNetwork(network)
    .withEnvironment({
      DATABASE_URL: 'jdbc:postgresql://pg:5432/fusionauth',
      DATABASE_ROOT_USERNAME: 'postgres',
      DATABASE_ROOT_PASSWORD: 'pg',
      DATABASE_USERNAME: 'fusionauth',
      DATABASE_PASSWORD: 'fusionauth',
      SEARCH_TYPE: 'database',
      FUSIONAUTH_APP_MEMORY: '512M',
      FUSIONAUTH_APP_KICKSTART_FILE: '/kickstart/kickstart.json',
    })
    .withCopyContentToContainer([{ content: JSON.stringify({ apiKeys: [{ key: API_KEY, description: 'integration' }] }), target: '/kickstart/kickstart.json' }])
    .withExposedPorts(9011)
    .withWaitStrategy(Wait.forHttp('/api/status', 9011).forStatusCode(200))
    .withStartupTimeout(240_000)
    .start();
  started.push(app);
  base = `http://${app.getHost()}:${app.getMappedPort(9011)}`;

  // The kickstart key can lag the status endpoint; wait until it's accepted.
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${base}/api/tenant`, { headers: { Authorization: API_KEY } }).then((r) => r.status === 200, () => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const tenantId = (await fa<{ tenants: Array<{ id: string }> }>('GET', '/api/tenant')).tenants[0]!.id;
  const clientSecret = randomBytes(16).toString('hex');
  const created = await fa<{ application: { id: string; oauthConfiguration: { clientId: string } } }>('POST', '/api/application', {
    application: {
      name: 'mariachi identity client',
      tenantId,
      loginConfiguration: { generateRefreshTokens: true },
      passwordlessConfiguration: { enabled: true },
      oauthConfiguration: { clientSecret, authorizedRedirectURLs: ['http://127.0.0.1/cb'], enabledGrants: ['authorization_code', 'refresh_token'] },
    },
  });
  client = createFusionAuthIdentityClient({
    serverUrl: base,
    apiKey: API_KEY,
    applicationId: created.application.id,
    clientId: created.application.oauthConfiguration.clientId,
    clientSecret,
  });
}, 300_000);

afterAll(async () => {
  for (const c of started.reverse()) await c.stop().catch(() => undefined);
  await network?.stop().catch(() => undefined);
});

const email = (tag: string) => `it-${tag}-${randomBytes(4).toString('hex')}@example.org`;
const PASSWORD = 'a-long-password-1';

describe('FusionAuthIdentityClient against FusionAuth', () => {
  it('signs in, refreshes, and signs out (the refresh token stops working)', async () => {
    const addr = email('pw');
    const user = await client.createUser({ email: addr, emailVerified: true, password: PASSWORD, name: 'Pat Word', externalId: 'ensemble-uuid-it' });
    expect(user).toMatchObject({ email: addr, emailVerified: true, name: 'Pat Word', externalId: 'ensemble-uuid-it' });

    const out = await client.signInWithPassword({ email: addr, password: PASSWORD });
    if (out.status !== 'signed-in') throw new Error(`expected signed-in, got ${out.status}`);
    expect(out.user).toMatchObject({ id: user.id, emailVerified: true });
    expect(out.tokens.refreshToken).toBeTruthy();

    const next = await client.refresh(out.tokens.refreshToken);
    expect(next.accessToken).toBeTruthy();

    await client.signOut({ refreshToken: next.refreshToken });
    await expect(client.refresh(next.refreshToken)).rejects.toMatchObject({ code: 'auth/invalid-grant' });
  });

  it('refuses a wrong password and an unknown user alike', async () => {
    const addr = email('wrong');
    await client.createUser({ email: addr, emailVerified: true, password: PASSWORD });
    await expect(client.signInWithPassword({ email: addr, password: 'not-the-password-1' })).rejects.toMatchObject({ code: 'auth/invalid-credentials' });
    await expect(client.signInWithPassword({ email: email('nobody'), password: PASSWORD })).rejects.toMatchObject({ code: 'auth/invalid-credentials' });
  });

  it('ID0 F1: a user nobody vouched for signs in with emailVerified false', async () => {
    const addr = email('self');
    const user = await client.createUser({ email: addr, emailVerified: false, password: PASSWORD });
    expect(user.emailVerified).toBe(false);
    const out = await client.signInWithPassword({ email: addr, password: PASSWORD });
    // FusionAuth's tenant has email verification off, so it signs the user in; the email still isn't vouched for.
    expect(out.status === 'signed-in' ? out.user.emailVerified : out.reason).toBe(false);
  });

  it('finds users by id and email; a deleted user is gone', async () => {
    const addr = email('lookup');
    const user = await client.createUser({ email: addr, emailVerified: true });
    expect((await client.getUser(user.id))?.email).toBe(addr);
    expect((await client.findUserByEmail(addr))?.id).toBe(user.id);
    await client.deleteUser(user.id);
    expect(await client.getUser(user.id)).toBeNull();
    expect(await client.findUserByEmail(addr)).toBeNull();
  });

  it('sets a password through the User API: the new one works, the old one does not', async () => {
    const addr = email('setpw');
    const user = await client.createUser({ email: addr, emailVerified: true, password: PASSWORD });
    await client.setPassword(user.id, 'another-long-password-2');
    expect((await client.signInWithPassword({ email: addr, password: 'another-long-password-2' })).status).toBe('signed-in');
    await expect(client.signInWithPassword({ email: addr, password: PASSWORD })).rejects.toMatchObject({ code: 'auth/invalid-credentials' });
  });

  it('passwordless: the app gets a code, and the code signs in once', async () => {
    const addr = email('pl');
    const user = await client.createUser({ email: addr, emailVerified: true, password: PASSWORD });
    const start = await client.startEmailCode(addr);
    if (start.deliveredBy !== 'app') throw new Error(`expected the app to send the code, got ${start.deliveredBy}`);
    const out = await client.signInWithEmailCode({ email: addr, code: start.code });
    expect(out.status === 'signed-in' && out.user.id).toBe(user.id);
    await expect(client.signInWithEmailCode({ email: addr, code: start.code })).rejects.toMatchObject({ code: 'auth/invalid-grant' });
  });

  it('says plainly when the tenant has no forgot-password email set up', async () => {
    const addr = email('reset');
    await client.createUser({ email: addr, emailVerified: true, password: PASSWORD });
    await expect(client.sendPasswordReset(addr)).rejects.toMatchObject({ code: 'auth/not-supported' });
  });
});

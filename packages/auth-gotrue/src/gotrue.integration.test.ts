import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { StartedNetwork, StartedTestContainer } from 'testcontainers';
import type { AuthWebhookEvent } from '@mariachi/auth';
import { createGoTrueAuth } from './index';

/**
 * Against a real GoTrue v2.197.0 (the version Ensemble pins) on Postgres 16, started with
 * Testcontainers: its JWKS, a password sign-in's token, and its signed access-token hook.
 */
const GOTRUE_IMAGE = 'supabase/auth:v2.197.0';
const started: StartedTestContainer[] = [];
let network: StartedNetwork;
let gotrue: string;
let issuer: string;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
const kid = 'integration-key';
const hookSecret = `v1,whsec_${randomBytes(32).toString('base64')}`;
let hookServer: Server;
const hookEvents: Array<AuthWebhookEvent | { error: string }> = [];

beforeAll(async () => {
  const { GenericContainer, Network, Wait } = await import('testcontainers');
  const provider = createGoTrueAuth({ url: 'http://unused.invalid', issuer: 'unused' });
  const handler = provider.createWebhookHandler({ secret: hookSecret });

  // The app's hook endpoint, on the host. GoTrue accepts an http hook URL only for localhost and
  // host.docker.internal (https otherwise), so the containers map host.docker.internal to the host.
  hookServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      try {
        const event = handler.verify(body, req.headers as Record<string, string>);
        hookEvents.push(event);
        const claims = { ...(event.data.claims as Record<string, unknown>), org_id: 'org-from-hook', org_role: 'owner' };
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ claims }));
      } catch (e) {
        hookEvents.push({ error: (e as Error).message });
        res.writeHead(401).end();
      }
    });
  });
  await new Promise<void>((r) => hookServer.listen(0, '0.0.0.0', r));
  const hookPort = (hookServer.address() as AddressInfo).port;

  network = await new Network().start();
  const pg = await new GenericContainer('postgres:16-alpine')
    .withNetwork(network)
    .withNetworkAliases('pg')
    .withEnvironment({ POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'app' })
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();
  started.push(pg);
  const init = await pg.exec([
    'psql', '-U', 'postgres', '-d', 'app', '-v', 'ON_ERROR_STOP=1',
    '-c', "CREATE ROLE supabase_auth_admin NOINHERIT CREATEROLE LOGIN PASSWORD 'auth'",
    '-c', 'CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin',
    '-c', 'GRANT CREATE ON DATABASE app TO supabase_auth_admin',
    '-c', "ALTER ROLE supabase_auth_admin SET search_path = 'auth'",
  ]);
  if (init.exitCode !== 0) throw new Error(`init: ${init.output}`);

  const keys = await generateKeyPair('ES256', { extractable: true });
  privateKey = keys.privateKey;
  const jwk = { ...(await exportJWK(keys.privateKey)), kid, alg: 'ES256', use: 'sig', key_ops: ['sign', 'verify'] };
  const env = {
    API_EXTERNAL_URL: 'http://localhost/auth/v1',
    GOTRUE_SITE_URL: 'http://localhost',
    GOTRUE_DB_DRIVER: 'postgres',
    DATABASE_URL: 'postgres://supabase_auth_admin:auth@pg:5432/app',
    GOTRUE_JWT_KEYS: JSON.stringify([jwk]),
    GOTRUE_JWT_SECRET: randomBytes(32).toString('hex'),
    GOTRUE_JWT_ISSUER: 'http://localhost/auth/v1',
    GOTRUE_JWT_AUD: 'authenticated',
    // Without it a new user's role, and every token's `role` claim, is empty.
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
    GOTRUE_API_HOST: '0.0.0.0',
    PORT: '9999',
    GOTRUE_MAILER_AUTOCONFIRM: 'true',
    GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED: 'true',
    GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI: `http://host.docker.internal:${hookPort}/hooks/access-token`,
    GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_SECRETS: hookSecret,
  };
  const migrate = await new GenericContainer(GOTRUE_IMAGE)
    .withNetwork(network)
    .withEnvironment(env)
    .withCommand(['auth', 'migrate'])
    .withWaitStrategy(Wait.forOneShotStartup())
    .start();
  started.push(migrate);
  const serve = await new GenericContainer(GOTRUE_IMAGE)
    .withNetwork(network)
    .withEnvironment(env)
    .withCommand(['auth', 'serve'])
    .withExtraHosts([{ host: 'host.docker.internal', ipAddress: 'host-gateway' }])
    .withExposedPorts(9999)
    .withWaitStrategy(Wait.forHttp('/health', 9999))
    .start();
  started.push(serve);
  gotrue = `http://${serve.getHost()}:${serve.getMappedPort(9999)}`;
  issuer = env.GOTRUE_JWT_ISSUER;
});

afterAll(async () => {
  await Promise.all(started.splice(0).map((c) => c.stop()));
  await network?.stop();
  await new Promise<void>((r) => hookServer?.close(() => r()));
});

async function json(path: string, init: RequestInit & { token?: string } = {}) {
  const res = await fetch(gotrue + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, any> };
}

describe('@mariachi/auth-gotrue against GoTrue v2.197.0', () => {
  it("verifies a password sign-in's token through GoTrue's JWKS, with the claims its signed hook added", async () => {
    const admin = await new SignJWT({ role: 'service_role' })
      .setProtectedHeader({ alg: 'ES256', kid })
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const created = await json('/admin/users', {
      method: 'POST',
      token: admin,
      body: JSON.stringify({ email: 'seed@example.test', password: 'seed-password-1', email_confirm: true, app_metadata: { persona: 'admin' } }),
    });
    expect(created.status).toBe(200);

    const signin = await json('/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: 'seed@example.test', password: 'seed-password-1' }),
    });
    expect(signin.status).toBe(200);

    const provider = createGoTrueAuth({ url: gotrue, issuer });
    const identity = await provider.verify(signin.body.access_token);
    expect(identity).toMatchObject({
      userId: created.body.id,
      tenantId: 'org-from-hook',
      roles: ['authenticated', 'owner'],
      identityType: 'session',
      sessionId: signin.body.user ? expect.any(String) : undefined,
    });
    expect(identity.claims).toMatchObject({ aal: 'aal1', app_metadata: { persona: 'admin' } });

    // GoTrue's hook call was signed and the handler normalized it.
    expect(hookEvents.length).toBeGreaterThan(0);
    expect(hookEvents.at(-1)).toMatchObject({ type: 'session.created', provider: 'gotrue', data: { userId: created.body.id, authenticationMethod: 'password' } });

    // A refresh re-runs the hook, normalized as session.refreshed.
    const refreshed = await json('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: signin.body.refresh_token }) });
    expect(refreshed.status).toBe(200);
    expect(hookEvents.at(-1)).toMatchObject({ type: 'session.refreshed' });
    await expect(provider.verify(refreshed.body.access_token)).resolves.toMatchObject({ userId: created.body.id });

    // A token for another issuer or with a forged signature fails against the live JWKS.
    await expect(createGoTrueAuth({ url: gotrue }).verify(signin.body.access_token)).rejects.toMatchObject({ code: 'auth/invalid-token' });
    await expect(provider.verify(`${signin.body.access_token.slice(0, -6)}AAAAAA`)).rejects.toMatchObject({ code: 'auth/invalid-token' });
  });
});

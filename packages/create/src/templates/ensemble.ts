import { LAYOUT, MARKERS } from '../layout';

/**
 * `mariachi init --auth ensemble`: sign-in by Ensemble's per-app auth (GoTrue beside the app at
 * `/auth/v1`, users in the app's own Postgres), verified with `@mariachi/auth-gotrue`; the tenant
 * is the organization in the token (`org_id`) through `@mariachi/tenancy`. These files replace or
 * extend the default project's.
 */

/** GoTrue's path on the app's host; the environment file's `auth.path` and the sign-in page agree on it. */
export const AUTH_PATH = '/auth/v1';
/** The port Ensemble runs a repository's `npm run dev` on (and routes `/` to). */
const APP_PORT = 3000;

/** `pnpm dev` loads `.env.ensemble` and then `.env` over it (`--env-file-if-exists` needs Node 22.9). */
export const ENSEMBLE_DEV_SCRIPT = 'tsx watch --env-file=.env.ensemble --env-file-if-exists=.env src/main.ts';
export const ENSEMBLE_NODE_ENGINES = '>=22.9';

export function databaseName(name: string): string {
  return name.replace(/[^a-z0-9_]/gi, '_');
}

export function ensembleFiles(name: string): Record<string, string> {
  const db = databaseName(name);
  const compose = composeYaml(db);
  return {
    '.env.example': ENV_EXAMPLE(name, db),
    '.env.ensemble': ENV_ENSEMBLE(name, db),
    'docker-compose.yml': compose,
    'ensemble.environment.json': `${JSON.stringify(environmentConfig(compose), null, 2)}\n`,
    'seed/users.yaml': SEED_USERS,
    'README.md': README(name),
    'AGENTS.md': AGENTS_AUTH,
    'src/config.ts': CONFIG_TS,
    'src/auth.ts': AUTH_TS,
    'src/auth.test.ts': AUTH_TEST,
    [LAYOUT.main]: MAIN_TS,
    [LAYOUT.controllersIndex]: CONTROLLERS_INDEX,
    [`${LAYOUT.controllersDir}/me.controller.ts`]: ME_CONTROLLER,
    [`${LAYOUT.controllersDir}/me.controller.test.ts`]: ME_CONTROLLER_TEST,
    [`${LAYOUT.controllersDir}/sign-in.controller.ts`]: SIGN_IN_CONTROLLER,
    [`${LAYOUT.controllersDir}/sign-in.controller.test.ts`]: SIGN_IN_CONTROLLER_TEST,
    'src/api/pages/sign-in.ts': SIGN_IN_PAGE,
  };
}

/**
 * The environment's settings in the shape of Ensemble's `EnvironmentUiConfig` (an environment's
 * `config`): Ensemble has no repository file for them yet, so they're pasted into the environment's
 * settings or sent as `config` to `POST /api/environments`.
 */
export function environmentConfig(compose: string) {
  return {
    customComposeYaml: compose,
    routes: [{ pathPrefix: '/', port: APP_PORT }],
    auth: { provider: 'ensemble', path: AUTH_PATH, seedUsers: 'seed/users.yaml' },
  };
}

/** The same file locally and in a preview, where GoTrue keeps its users in this database (`POSTGRES_DB`). */
const composeYaml = (db: string) => `services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${db}
    ports: ["5432:5432"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
`;

const ENV_EXAMPLE = (name: string, db: string) => `SERVICE_NAME=${name}
NODE_ENV=development
PORT=${APP_PORT}
DATABASE_URL=postgres://postgres:postgres@localhost:5432/${db}
REDIS_URL=redis://localhost:6379
MIGRATE_ON_START=false

# Sign-in (GoTrue, Ensemble's per-app auth). Tokens are ES256, checked against GoTrue's JWKS, issuer
# and audience. Name the GoTrue whose tokens this app accepts with one of:
#   AUTH_URL       its public base URL, path included, e.g. https://<preview host>/auth/v1
#   AUTH_ORIGIN    the origin it's served under; AUTH_PATH (default ${AUTH_PATH}) is appended
#   APP_ORIGIN     the app's own origin, used like AUTH_ORIGIN when that is unset
# and optionally AUTH_JWKS_URL, where to read the JWKS if not <AUTH_URL>/.well-known/jwks.json.
# With none of them set (an Ensemble preview), GoTrue is read at AUTH_INTERNAL_URL (default
# http://127.0.0.1:9999, the guest's loopback) and the issuer comes from its discovery document.
# AUTH_URL=https://<preview host>${AUTH_PATH}
`;

const ENV_ENSEMBLE = (name: string, db: string) => `# What the app runs with in an Ensemble preview, which has no .env (Ensemble doesn't pass
# environment variables to a repository's app yet). No secrets: the Compose services' local
# credentials. \`pnpm dev\` loads this file first and .env over it, so a local .env wins.
SERVICE_NAME=${name}
NODE_ENV=development
PORT=${APP_PORT}
DATABASE_URL=postgres://postgres:postgres@localhost:5432/${db}
REDIS_URL=redis://localhost:6379
# Apply the committed migrations (drizzle/) at start: nothing else runs them in a preview.
MIGRATE_ON_START=true
# No AUTH_URL: GoTrue answers on the guest's loopback (AUTH_INTERNAL_URL, default
# http://127.0.0.1:9999) and names the preview's public issuer in its discovery document.
`;

const SEED_USERS = `# Personas Ensemble creates in each preview's GoTrue when it builds the environment
# (the environment's auth.seedUsers). Each is a confirmed user with app_metadata.persona set,
# which "view as" and the Users tab list.
#
# These passwords are readable by anyone who can read the repository: they're for preview test
# accounts only. Leave a password out and that persona signs in by magic link (the preview
# mailbox) or "view as".
#
# A persona's organization and role (the org_id and org_role claims the API reads) come from
# Ensemble's organizations, not from this file.
users:
  - email: admin@example.test
    persona: admin
    password: admin-preview-password
    userMetadata:
      name: Ada Admin
  - email: member@example.test
    persona: member
    password: member-preview-password
    userMetadata:
      name: Max Member
`;

const CONFIG_TS = `import { registerConfigSection } from '@mariachi/config';
import { z } from 'zod';

/** This app's own settings, read from the environment by \`@mariachi/config\` (\`useConfigSection(APP_CONFIG)\`). */
export const APP_CONFIG = 'app';

const optional = (v: string | undefined) => (v ? v : undefined);

const appSchema = z.object({
  auth: z
    .object({
      /** GoTrue's public base URL, path included (\`AUTH_URL\`). */
      url: z.string().url().optional(),
      /** The origin GoTrue is served under (\`AUTH_ORIGIN\`, else the app's own \`APP_ORIGIN\`); \`path\` is appended. */
      origin: z.string().url().optional(),
      /** GoTrue's path on that origin (\`AUTH_PATH\`). */
      path: z.string().regex(/^(\\/[A-Za-z0-9._~-]+)+$/).default('${AUTH_PATH}'),
      /** Where GoTrue answers inside an Ensemble preview (\`AUTH_INTERNAL_URL\`): used when no public URL is set. */
      internalUrl: z.string().url().default('http://127.0.0.1:9999'),
      /** Where to read the JWKS, if not \`<url>/.well-known/jwks.json\` (\`AUTH_JWKS_URL\`). */
      jwksUrl: z.string().url().optional(),
    })
    .default({}),
  /** Apply the committed migrations (\`drizzle/\`) at start (\`MIGRATE_ON_START\`). */
  migrateOnStart: z.boolean().default(false),
});

export type AppSettings = z.infer<typeof appSchema>;
export type AuthSettings = AppSettings['auth'];

registerConfigSection(APP_CONFIG, {
  schema: appSchema,
  fromEnv: (read) => ({
    auth: {
      url: optional(read('AUTH_URL')),
      origin: optional(read('AUTH_ORIGIN')) ?? optional(read('APP_ORIGIN')),
      path: optional(read('AUTH_PATH')),
      internalUrl: optional(read('AUTH_INTERNAL_URL')),
      jwksUrl: optional(read('AUTH_JWKS_URL')),
    },
    migrateOnStart: optional(read('MIGRATE_ON_START')) === undefined ? undefined : read('MIGRATE_ON_START') === 'true',
  }),
});
`;

const AUTH_TS = `import type { GoTrueConfig } from '@mariachi/auth-gotrue';
import type { AuthSettings } from './config';

/**
 * Where the app finds GoTrue (Ensemble's per-app auth, at ${AUTH_PATH} on the app's host):
 * - \`AUTH_URL\`, or \`AUTH_ORIGIN\` / \`APP_ORIGIN\` plus \`AUTH_PATH\`: that public URL is the issuer, and
 *   the JWKS is read under it unless \`AUTH_JWKS_URL\` says otherwise;
 * - none of them, as in an Ensemble preview: GoTrue on the guest's loopback (\`AUTH_INTERNAL_URL\`),
 *   whose discovery document names the preview's public issuer.
 */
export function goTrueConfig(auth: AuthSettings): GoTrueConfig {
  const url = auth.url ?? (auth.origin ? \`\${auth.origin.replace(/\\/+$/, '')}\${auth.path}\` : undefined);
  if (url) return auth.jwksUrl ? { url, jwksUrl: auth.jwksUrl } : { url };
  return { url: auth.internalUrl, discoverIssuer: true };
}
`;

const AUTH_TEST = `import { describe, expect, it } from 'vitest';
import { goTrueConfig } from './auth';

const defaults = { path: '${AUTH_PATH}', internalUrl: 'http://127.0.0.1:9999' };

describe('goTrueConfig', () => {
  it('uses AUTH_URL as the issuer, with its JWKS unless AUTH_JWKS_URL is set', () => {
    expect(goTrueConfig({ ...defaults, url: 'https://app.example.com${AUTH_PATH}' })).toEqual({ url: 'https://app.example.com${AUTH_PATH}' });
    expect(goTrueConfig({ ...defaults, url: 'https://app.example.com${AUTH_PATH}', jwksUrl: 'http://127.0.0.1:9999/.well-known/jwks.json' })).toEqual({
      url: 'https://app.example.com${AUTH_PATH}',
      jwksUrl: 'http://127.0.0.1:9999/.well-known/jwks.json',
    });
  });

  it('appends AUTH_PATH to AUTH_ORIGIN (or APP_ORIGIN)', () => {
    expect(goTrueConfig({ ...defaults, origin: 'https://app.example.com/' })).toEqual({ url: 'https://app.example.com${AUTH_PATH}' });
  });

  it("reads GoTrue on the preview's loopback and discovers the issuer when no public URL is set", () => {
    expect(goTrueConfig(defaults)).toEqual({ url: 'http://127.0.0.1:9999', discoverIssuer: true });
  });
});
`;

const MAIN_TS = `import { existsSync } from 'node:fs';
import { ConfigError, KEYS } from '@mariachi/core';
import { useConfigSection } from '@mariachi/config';
import { bootstrap } from '@mariachi/lifecycle';
import { createCommunication } from '@mariachi/communication';
import { createPostgresDatabase, runMigrations } from '@mariachi/database-postgres';
import { createJobQueue, DefaultJobs } from '@mariachi/jobs';
import { createGoTrueAuth } from '@mariachi/auth-gotrue';
import { createTenancy, createTenancyMiddleware } from '@mariachi/tenancy';
import { bearerStrategy, createApiServer } from '@mariachi/api-facade';
import { APP_CONFIG, type AppSettings } from './config';
import { goTrueConfig } from './auth';
import { createControllers } from './api/controllers/index';
import { registerServices } from './services/index';
import { jobs as jobDefinitions } from './jobs/index';

const MIGRATIONS = 'drizzle';

async function main(): Promise<void> {
  const { config, logger, tracer, metrics, container, lifecycle } = bootstrap();
  const instrumentation = { logger, tracer, metrics };
  const app = useConfigSection<AppSettings>(APP_CONFIG);

  if (!config.database) throw new ConfigError('app/database-required', 'DATABASE_URL is required');
  if (!config.redis) throw new ConfigError('app/redis-required', 'REDIS_URL is required');

  // Startup runs in ascending priority; shutdown runs in reverse.
  const database = lifecycle.manage(
    'database',
    createPostgresDatabase({ url: config.database.url, poolMin: config.database.poolMin, poolMax: config.database.poolMax }),
    { priority: 10 },
  );
  container.register(KEYS.Database, database);
  if (app.migrateOnStart) {
    lifecycle.startup.register({
      name: 'migrations',
      priority: 15,
      fn: async () => {
        if (!existsSync(\`\${MIGRATIONS}/meta/_journal.json\`)) {
          logger.warn({ folder: MIGRATIONS }, 'MIGRATE_ON_START: no migrations yet (pnpm db:generate, then commit drizzle/)');
          return;
        }
        await runMigrations(database.adapter, { migrationsFolder: MIGRATIONS, logger });
      },
    });
  }

  const jobs = new DefaultJobs(
    { queue: createJobQueue({ adapter: 'bullmq', redisUrl: config.redis.url, prefix: config.serviceName }, logger) },
    instrumentation,
  );
  for (const job of jobDefinitions) jobs.registerJob(job);
  lifecycle.manage('jobs', jobs, { priority: 20 });
  lifecycle.startup.register({ name: 'jobs-worker', priority: 90, fn: () => jobs.start() });
  container.register(KEYS.JobQueue, jobs);

  // One communication layer per process: handlers register on it, controllers call through it.
  const communication = createCommunication({}, instrumentation);
  container.register(KEYS.Communication, communication);
  // Repositories take the Drizzle client when they're built, so connect first (the startup connect is then a no-op).
  await database.connect();
  registerServices(communication, { db: database.db, jobs });

  // Sign-in is Ensemble's: GoTrue beside the app at ${AUTH_PATH}, its ES256 tokens checked against its JWKS.
  const auth = createGoTrueAuth(goTrueConfig(app.auth));
  // The tenant is the organization in the token (org_id, added by Ensemble's access-token hook). A
  // claim or x-tenant-id header that disagrees with the verified identity is refused (tenancy/mismatch).
  const tenancy = createTenancy({ strategy: 'jwt-claim', claimName: 'org_id' }, instrumentation);

  const api = createApiServer({
    name: 'api',
    prefix: '/api',
    logger,
    tracer,
    trustProxy: config.server.trustProxy,
    bodyLimitBytes: config.server.bodyLimitBytes,
    cors: config.server.corsOrigins.length > 0 ? { origins: config.server.corsOrigins } : false,
  })
    .withAuthStrategy('session', bearerStrategy(auth))
    .withAuth('session')
    .withMiddleware(createTenancyMiddleware(tenancy))
    .withHealth(lifecycle.health)
    .withOpenApi({ info: { title: config.serviceName, version: '0.1.0' } });
  for (const controller of createControllers(communication)) api.registerController(controller);

  lifecycle.startup.register({
    name: 'api',
    priority: 100,
    fn: async () => {
      const address = await api.listen(config.server.port, config.server.host);
      logger.info({ address }, 'API listening');
    },
  });
  lifecycle.shutdown.register({ name: 'api', priority: 100, fn: () => api.close() });

  await lifecycle.start();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
`;

const CONTROLLERS_INDEX = `import type { BaseController } from '@mariachi/api-facade';
import type { CommunicationLayer } from '@mariachi/communication';
import { MeController } from './me.controller';
import { SignInController } from './sign-in.controller';
// ${MARKERS.imports}

export function createControllers(communication: CommunicationLayer): BaseController[] {
  return [
    new MeController(communication),
    new SignInController(communication),
    // ${MARKERS.controllers}
  ];
}
`;

const ME_CONTROLLER = `import { BaseController } from '@mariachi/api-facade';
import { z } from 'zod';

const meResponse = z.object({
  userId: z.string(),
  /** The organization (\`org_id\`). */
  tenantId: z.string(),
  /** \`authenticated\` plus the role in the organization (\`org_role\`). */
  roles: z.array(z.string()),
  email: z.string().optional(),
  /** The seeded persona (\`app_metadata.persona\`), in a preview. */
  persona: z.string().optional(),
  /** Who is acting, when a reviewer signed in as this user ("view as", the \`act\` claim). */
  actingAs: z.string().optional(),
});

export type Me = z.infer<typeof meResponse>;

const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const record = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** The signed-in user, from the verified token. Every route here needs a token with an organization. */
export class MeController extends BaseController {
  readonly prefix = 'me';
  readonly tags = ['me'];

  init(): void {
    this.get('/', { schema: { response: meResponse } }, async (ctx) => {
      const claims = record(ctx.identity?.claims);
      return {
        userId: ctx.userId ?? '',
        tenantId: ctx.tenantId ?? '',
        roles: ctx.identity?.roles ?? [],
        email: text(claims.email),
        persona: text(record(claims.app_metadata).persona),
        actingAs: text(record(claims.act).sub),
      };
    });

    // Roles (and so scopes) include the organization role: \`scopes: ['admin']\` admits its admins.
    this.get('/admin', { scopes: ['admin'], schema: { response: z.object({ admin: z.literal(true) }) } }, async () => ({
      admin: true as const,
    }));
  }
}
`;

const ME_CONTROLLER_TEST = `import { describe, expect, it } from 'vitest';
import { AuthError, type Logger } from '@mariachi/core';
import { bearerStrategy, createApiServer, type ResolvedIdentity } from '@mariachi/api-facade';
import { MeController } from './me.controller';

const logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => logger } as unknown as Logger;

// What @mariachi/auth-gotrue returns for the seeded personas once Ensemble's hook added their org claims.
const persona = (name: string, orgRole: string): ResolvedIdentity => ({
  userId: \`user-\${name}\`,
  tenantId: 'org-acme',
  scopes: ['authenticated', orgRole],
  roles: ['authenticated', orgRole],
  identityType: 'session',
  claims: { sub: \`user-\${name}\`, email: \`\${name}@example.test\`, org_id: 'org-acme', org_role: orgRole, app_metadata: { persona: name } },
});
const tokens: Record<string, ResolvedIdentity> = { admin: persona('admin', 'admin'), member: persona('member', 'member') };

function server() {
  const verifier = {
    async verify(token: string) {
      const identity = tokens[token];
      if (!identity) throw new AuthError('auth/invalid-token', 'Invalid token');
      return identity;
    },
  };
  return createApiServer({ name: 'test', prefix: '/api', logger })
    .withAuthStrategy('session', bearerStrategy(verifier))
    .withAuth('session')
    .registerController(new MeController());
}

const get = (url: string, token?: string) =>
  server().inject({ method: 'GET', url, headers: token ? { authorization: \`Bearer \${token}\` } : {} });

describe('MeController', () => {
  it('returns the signed-in user with their organization, roles and persona', async () => {
    const res = await get('/api/me', 'member');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      userId: 'user-member',
      tenantId: 'org-acme',
      roles: ['authenticated', 'member'],
      email: 'member@example.test',
      persona: 'member',
    });
  });

  it("admits only the organization's admins to /me/admin", async () => {
    expect((await get('/api/me/admin', 'admin')).statusCode).toBe(200);
    expect((await get('/api/me/admin', 'member')).statusCode).toBe(403);
  });

  it('needs a valid token', async () => {
    expect((await get('/api/me')).statusCode).toBe(401);
    expect((await get('/api/me', 'forged')).statusCode).toBe(401);
  });
});
`;

const SIGN_IN_CONTROLLER = `import { BaseController, httpResponse } from '@mariachi/api-facade';
import { SIGN_IN_HTML, SIGN_IN_JS } from '../pages/sign-in';

// The page loads its script from this origin and calls only this origin (the API and ${AUTH_PATH}).
const CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** An example sign-in page at /api/sign-in: password, sign-up and magic link against GoTrue, then GET /api/me. */
export class SignInController extends BaseController {
  readonly prefix = 'sign-in';
  readonly tags = ['sign-in'];

  init(): void {
    this.get('/', { auth: false, summary: 'Example sign-in page' }, async () =>
      httpResponse(200, SIGN_IN_HTML, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP, 'cache-control': 'no-store' }),
    );
    this.get('/client.js', { auth: false, summary: "The sign-in page's script" }, async () =>
      httpResponse(200, SIGN_IN_JS, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }),
    );
  }
}
`;

const SIGN_IN_CONTROLLER_TEST = `import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { Logger } from '@mariachi/core';
import { createApiServer } from '@mariachi/api-facade';
import { SignInController } from './sign-in.controller';
import { SIGN_IN_JS } from '../pages/sign-in';

const logger = { debug() {}, info() {}, warn() {}, error() {}, child: () => logger } as unknown as Logger;
const server = () => createApiServer({ name: 'test', prefix: '/api', logger }).registerController(new SignInController());

describe('SignInController', () => {
  it('serves the page without a token, locked to this origin by its CSP', async () => {
    const res = await server().inject({ method: 'GET', url: '/api/sign-in' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.body).toContain('<script type="module" src="/api/sign-in/client.js">');
  });

  it("serves the page's script, which talks to GoTrue at ${AUTH_PATH} and compiles", async () => {
    const res = await server().inject({ method: 'GET', url: '/api/sign-in/client.js' });
    expect(res.headers['content-type']).toContain('text/javascript');
    expect(res.body).toContain("const AUTH = '${AUTH_PATH}'");
    expect(() => new Script(SIGN_IN_JS)).not.toThrow();
  });
});
`;

// The page's script is plain browser JavaScript in a string: no template literals or backslashes inside.
const SIGN_IN_PAGE = `/**
 * An example sign-in flow against GoTrue at ${AUTH_PATH} with plain fetch: password sign-in, sign-up,
 * a magic link (in a preview it lands in the preview mailbox) and sign-out. The session is kept in
 * sessionStorage and sent to the API as a bearer token. supabase-js does the same (see README.md).
 */
export const SIGN_IN_HTML = \`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; }
  label, input, button { display: block; width: 100%; box-sizing: border-box; }
  input { margin: 0.25rem 0 1rem; padding: 0.5rem; }
  button { margin: 0.5rem 0; padding: 0.5rem; cursor: pointer; }
  pre { background: #f4f4f5; padding: 1rem; overflow: auto; white-space: pre-wrap; }
</style>
</head>
<body>
<h1>Sign in</h1>
<p>Signs in against the app's GoTrue at <code>${AUTH_PATH}</code> with plain <code>fetch</code>, then calls <code>GET /api/me</code>.</p>
<section id="signed-out">
  <form id="password-form">
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="email" required>
    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="current-password">
    <button type="submit">Sign in with password</button>
    <button type="button" id="sign-up">Sign up with this email and password</button>
    <button type="button" id="magic-link">Email me a sign-in link</button>
  </form>
</section>
<section id="signed-in" hidden>
  <button type="button" id="sign-out">Sign out</button>
</section>
<p id="status" role="status"></p>
<pre id="output"></pre>
<script type="module" src="/api/sign-in/client.js"></script>
</body>
</html>
\`;

export const SIGN_IN_JS = \`const AUTH = '${AUTH_PATH}';
const KEY = 'session';
const byId = (id) => document.getElementById(id);
const here = () => location.origin + location.pathname;

function show(message, data) {
  byId('status').textContent = message;
  byId('output').textContent = data === undefined ? '' : JSON.stringify(data, null, 2);
}

function save(session) {
  const expiresAt = Number(session.expires_at) || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
  sessionStorage.setItem(KEY, JSON.stringify({ accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: expiresAt }));
}

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

// GoTrue's endpoints (what supabase-js calls): POST JSON, errors as { msg } or { error_description }.
async function gotrue(path, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(AUTH + path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) });
  const data = await res.json().catch(() => ({}));
  // Browser code, outside the framework's error types. mariachi-validate-ignore no-raw-error
  if (!res.ok) throw new Error(data.msg || data.error_description || data.message || 'HTTP ' + res.status);
  return data;
}

// The stored session, refreshed when its access token is (nearly) expired.
async function current() {
  const session = load();
  if (!session || session.expiresAt - 30 > Date.now() / 1000) return session;
  try {
    save(await gotrue('/token?grant_type=refresh_token', { refresh_token: session.refreshToken }));
    return load();
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}

async function render() {
  const session = await current();
  byId('signed-out').hidden = Boolean(session);
  byId('signed-in').hidden = !session;
  if (!session) return;
  const res = await fetch('/api/me', { headers: { authorization: 'Bearer ' + session.accessToken } });
  const body = await res.json().catch(() => ({}));
  if (res.ok) show('Signed in.', body);
  else if (body.error && body.error.code === 'tenancy/missing-tenant') {
    show('Signed in, but the token names no organization (org_id), which the API needs. Ensemble adds it for a member of an organization.', body);
  } else show('GET /api/me answered ' + res.status, body);
}

// After a magic or confirmation link, GoTrue redirects here with the session (or an error) in the hash.
function fromRedirect() {
  if (!location.hash) return;
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  if (params.get('access_token')) {
    save({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), expires_at: params.get('expires_at'), expires_in: params.get('expires_in') });
  } else if (params.get('error_description')) show(params.get('error_description'));
}

const credentials = () => ({ email: byId('email').value.trim(), password: byId('password').value });

byId('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    save(await gotrue('/token?grant_type=password', credentials()));
    await render();
  } catch (error) {
    show('Sign-in failed: ' + error.message);
  }
});

byId('sign-up').addEventListener('click', async () => {
  try {
    const result = await gotrue('/signup?redirect_to=' + encodeURIComponent(here()), credentials());
    if (result.access_token) {
      save(result);
      await render();
    } else show('Check your email for the confirmation link (in a preview: the preview mailbox).');
  } catch (error) {
    show('Sign-up failed: ' + error.message);
  }
});

byId('magic-link').addEventListener('click', async () => {
  try {
    await gotrue('/otp?redirect_to=' + encodeURIComponent(here()), { email: credentials().email, create_user: true });
    show('Check your email for the sign-in link (in a preview: the preview mailbox).');
  } catch (error) {
    show('Could not send the link: ' + error.message);
  }
});

byId('sign-out').addEventListener('click', async () => {
  const session = load();
  sessionStorage.removeItem(KEY);
  if (session) await gotrue('/logout', {}, session.accessToken).catch(() => undefined);
  show('Signed out.');
  await render();
});

fromRedirect();
render();
\`;
`;

const AGENTS_AUTH = `# Agent guide

This is a [Mariachi](https://github.com/) backend. Before writing code, read the framework docs shipped
with \`@mariachi/core\`:

- \`node_modules/@mariachi/core/docs/README.md\` (start here: layers, conventions, package catalog)
- \`node_modules/@mariachi/core/docs/recipes/\` (step-by-step: entity, job, webhook, integration)
- \`node_modules/@mariachi/core/docs/auth-and-providers.md\` (how identity reaches \`ctx\`)

## Layout

| Path | Layer |
| --- | --- |
| \`src/main.ts\` | Composition root: config, lifecycle, database, jobs, communication, sign-in and tenancy, HTTP server |
| \`src/config.ts\`, \`src/auth.ts\` | This app's settings (\`AUTH_*\`, \`MIGRATE_ON_START\`) and where it finds GoTrue |
| \`src/contracts/\` | Zod schemas + procedure types shared by controllers and handlers |
| \`src/api/controllers/\` | HTTP controllers (\`BaseController\`); call procedures, never services |
| \`src/services/<name>/\` | Service, repository and communication handlers for one domain |
| \`src/schema/\` | \`defineTable\` tables; \`mariachi db generate\` turns them into migrations |
| \`src/jobs/\` | \`defineJob\` background jobs |
| \`ensemble.environment.json\`, \`seed/users.yaml\` | The Ensemble environment's settings and its seeded personas |

## Sign-in, organizations and roles

- Users sign in with GoTrue (Ensemble's per-app auth) at \`${AUTH_PATH}\` on the app's own host; never add
  another auth provider or store passwords. \`@mariachi/auth-gotrue\` verifies the tokens.
- \`ctx.tenantId\` is the user's organization (the \`org_id\` claim); tenant-scoped tables and repositories
  rely on it. Never take the tenant from the request body.
- \`ctx.identity.roles\` holds \`authenticated\` and the organization role (\`org_role\`); gate a route with
  \`scopes: ['admin']\`. Other claims (\`app_metadata\`, \`act\` for "view as") are in \`ctx.identity.claims\`.

## Generators

\`\`\`bash
pnpm mariachi generate entity <name>      # schema + repository + service + handler + controller + test
pnpm mariachi generate service <name>
pnpm mariachi generate controller <name>
pnpm mariachi generate job <name>
pnpm mariachi generate integration <name>
pnpm validate                            # architecture rules; run before committing
\`\`\`
`;

const README = (name: string) => `# ${name}

A Mariachi backend with sign-in by **Ensemble**: in each preview, GoTrue (Supabase Auth) runs beside
the app at \`${AUTH_PATH}\` on the same host and keeps the users in this app's Postgres. The API
verifies GoTrue's tokens (\`@mariachi/auth-gotrue\`) and scopes every request to the user's
organization (\`@mariachi/tenancy\`, the \`org_id\` claim).

## Run in an Ensemble preview

1. Generate and commit the migrations: \`pnpm install && docker compose up -d && pnpm db:generate\`, then
   commit \`drizzle/\`. The preview applies them at start (\`MIGRATE_ON_START\` in \`.env.ensemble\`).
2. Create the environment from \`ensemble.environment.json\`. **Ensemble has no repository file for an
   environment's settings yet**, so copy them in: the Compose file (\`customComposeYaml\`), the route
   (\`/\` → port 3000) and sign-in (\`auth\`: provider \`ensemble\`, path \`${AUTH_PATH}\`, seed users
   \`seed/users.yaml\`) in the environment's settings, or send the file as \`config\` to
   \`POST /api/environments\` (or \`PATCH /api/environments/:id\`). Sign-in needs the VM tier (Firecracker).
3. Open \`/api/sign-in\` on the preview and sign in as a persona from \`seed/users.yaml\`, or sign up.

The app gets no environment variables from Ensemble, so \`pnpm dev\` loads \`.env.ensemble\` (no
secrets) and then \`.env\` over it. With no \`AUTH_URL\` it reads GoTrue on the guest's loopback
(\`http://127.0.0.1:9999\`) and learns the preview's issuer from GoTrue's discovery document.

## Run locally

\`\`\`bash
cp .env.example .env    # then set AUTH_URL to a GoTrue, e.g. https://<preview host>${AUTH_PATH}
docker compose up -d
pnpm install
pnpm db:generate && pnpm db:migrate
pnpm dev
\`\`\`

The API listens on \`PORT\` (default 3000) under \`/api\`. Health checks: \`/api/health/live\`,
\`/api/health/ready\`, \`/api/health/startup\`. OpenAPI: \`/api/openapi.json\`.

## Sign-in

\`/api/sign-in\` is an example page (\`src/api/pages/sign-in.ts\`): password sign-in, sign-up and a magic
link against \`${AUTH_PATH}\` with plain \`fetch\`, then \`GET /api/me\` with the access token as a bearer
token. In a preview, emails land in the preview mailbox. The same with supabase-js (any non-empty key:
GoTrue doesn't check it):

\`\`\`ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(window.location.origin, 'unused');
await supabase.auth.signInWithPassword({ email, password });
await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: \`\${window.location.origin}/api/sign-in\` } });
const { data } = await supabase.auth.getSession();
await fetch('/api/me', { headers: { authorization: \`Bearer \${data.session?.access_token}\` } });
\`\`\`

## Organizations and roles

- \`ctx.tenantId\` is the organization in the token (\`org_id\`), added by Ensemble's access-token hook
  for a member of an organization. A token without one gets \`tenancy/missing-tenant\` from every route
  that needs sign-in, and a request naming another tenant gets \`tenancy/mismatch\`.
- \`ctx.identity.roles\` is \`authenticated\` plus the role in that organization (\`org_role\`): gate a route
  with \`scopes: ['admin']\` (see \`GET /api/me/admin\`).
- \`seed/users.yaml\` declares the personas each preview starts with (\`admin\`, \`member\`). Their
  passwords are readable by anyone with the repository: preview test accounts only.

## Settings

| Variable | Default | |
| --- | --- | --- |
| \`AUTH_URL\` | | GoTrue's public base URL, path included: the tokens' issuer |
| \`AUTH_ORIGIN\`, \`APP_ORIGIN\` | | Or the origin it's served under; \`AUTH_PATH\` is appended |
| \`AUTH_PATH\` | \`${AUTH_PATH}\` | |
| \`AUTH_JWKS_URL\` | \`<AUTH_URL>/.well-known/jwks.json\` | Where to read the signing keys |
| \`AUTH_INTERNAL_URL\` | \`http://127.0.0.1:9999\` | GoTrue in a preview, used when none of the above is set |
| \`MIGRATE_ON_START\` | \`false\` (\`true\` in \`.env.ensemble\`) | Apply \`drizzle/\` migrations at start |
`;

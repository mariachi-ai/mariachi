import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { createProject } from '../generators';
import { AUTH_PATH, organizationSlug } from './ensemble';
import { projectFiles } from './project';

/**
 * Ensemble's contract for what these files feed (`@ensemble/contracts/runtime`, app-auth AU1.1),
 * copied here because Mariachi doesn't depend on Ensemble. Keep in step with `specAuthSchema`,
 * `appAuthSeedUsersSchema` and the route and Compose checks of the environments handler.
 */
const specAuthSchema = z
  .object({
    provider: z.literal('ensemble'),
    path: z.string().regex(/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/).max(100),
    providers: z.array(z.enum(['google', 'github'])).optional(),
    seedUsers: z
      .string()
      .min(1)
      .max(500)
      .refine((p) => !p.startsWith('/') && !p.split('/').includes('..')),
  })
  .strict();
const environmentConfigSchema = z
  .object({
    customComposeYaml: z.string().min(1),
    routes: z.array(z.object({ pathPrefix: z.string().min(1), port: z.number().int().min(1).max(65535) }).strict()),
    auth: specAuthSchema,
  })
  .strict();
const orgSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const orgRole = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/);
const appAuthSeedUsersSchema = z
  .object({
    organizations: z.array(z.object({ slug: orgSlug, name: z.string().min(1).max(200).optional() }).strict()).max(50).optional(),
    users: z
      .array(
        z
          .object({
            email: z.string().email().max(254),
            persona: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/).optional(),
            password: z.string().min(8).max(72).optional(),
            appMetadata: z.record(z.unknown()).optional(),
            userMetadata: z.record(z.unknown()).optional(),
            orgs: z.array(z.object({ slug: orgSlug, role: orgRole.default('member') }).strict()).max(20).optional(),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .refine((f) => f.users.every((u) => (u.orgs ?? []).every((o) => f.organizations?.some((org) => org.slug === o.slug))), {
    message: "a user's org must be listed under organizations",
  });
// The API resolves GoTrue's database from the first Postgres service's POSTGRES_DB (resolveAuthTarget).
const POSTGRES_IMAGE = /(^|\/)(postgres|postgis|timescaledb|supabase\/postgres)[^/]*(:|@|$)/i;
const IDENT = /^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/;

const files = projectFiles('acme-app', '^0.1.0', 'ensemble');
const pkg = JSON.parse(files['package.json']);

/** The string a generated `export const NAME = \`...\`;` holds. */
function constant(source: string, name: string): string {
  const start = source.indexOf(`export const ${name} = \``);
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(source.indexOf('`', start) + 1);
  return body.slice(0, body.indexOf('`;'));
}

describe('mariachi init --auth ensemble', () => {
  it('adds the GoTrue provider and tenancy, and loads .env.ensemble under .env', () => {
    expect(pkg.dependencies).toMatchObject({ '@mariachi/auth-gotrue': '^0.1.0', '@mariachi/tenancy': '^0.1.0', '@mariachi/auth': '^0.1.0' });
    const framework = Object.keys(pkg.dependencies).filter((d) => d.startsWith('@mariachi/'));
    expect(framework).toEqual([...framework].sort());
    expect(pkg.scripts.dev).toBe('tsx watch --env-file=.env.ensemble --env-file-if-exists=.env src/main.ts');
    expect(pkg.engines.node).toBe('>=22.9');
  });

  it('writes the environment file, seed users, sign-in page and the auth wiring', () => {
    expect(Object.keys(files).filter((f) => !(f in projectFiles('acme-app', '^0.1.0'))).sort()).toEqual([
      '.env.ensemble',
      'ensemble.environment.json',
      'seed/users.yaml',
      'src/api/controllers/me.controller.test.ts',
      'src/api/controllers/me.controller.ts',
      'src/api/controllers/sign-in.controller.test.ts',
      'src/api/controllers/sign-in.controller.ts',
      'src/api/pages/sign-in.ts',
      'src/auth.test.ts',
      'src/auth.ts',
      'src/config.ts',
    ]);
    const main = files['src/main.ts'];
    expect(main).toContain('createGoTrueAuth(goTrueConfig(app.auth))');
    expect(main).toContain("createTenancy({ strategy: 'jwt-claim', claimName: 'org_id' }, instrumentation)");
    expect(main).toContain('.withMiddleware(createTenancyMiddleware(tenancy))');
    expect(main).toContain("bearerStrategy(auth)");
    expect(main).not.toMatch(/JWTAdapter|JWT_SECRET|jwtSecret/);
    expect(files['.env.example']).not.toContain('JWT_SECRET');
    expect(files['src/api/controllers/index.ts']).toMatch(/new MeController\(communication\),\n\s+new SignInController\(communication\),\n\s+\/\/ mariachi:controllers/);
  });

  it('writes an environment config Ensemble accepts: Compose with Postgres, a route, and auth', () => {
    const env = environmentConfigSchema.parse(JSON.parse(files['ensemble.environment.json']));
    expect(env.auth).toEqual({ provider: 'ensemble', path: AUTH_PATH, seedUsers: 'seed/users.yaml' });
    expect(env.routes).toEqual([{ pathPrefix: '/', port: 3000 }]);
    expect(env.customComposeYaml).toBe(files['docker-compose.yml']);
    const compose = parseYaml(env.customComposeYaml) as { services: Record<string, { image: string; environment: Record<string, string> }> };
    const [name, postgres] = Object.entries(compose.services).find(([, s]) => POSTGRES_IMAGE.test(s.image)) ?? [];
    expect(name).toBe('postgres');
    expect(postgres?.environment.POSTGRES_DB).toBe('acme_app');
    expect(postgres?.environment.POSTGRES_DB).toMatch(IDENT);
    // The app's preview settings point at that same database, and leave GoTrue's URL to discovery.
    expect(files['.env.ensemble']).toContain('DATABASE_URL=postgres://postgres:postgres@localhost:5432/acme_app');
    expect(files['.env.ensemble']).toContain('MIGRATE_ON_START=true');
    expect(files['.env.ensemble']).not.toMatch(/^AUTH_URL=/m);
  });

  it("seeds the project's organization with an admin and a member persona, per the seed users contract", () => {
    const seed = appAuthSeedUsersSchema.parse(parseYaml(files['seed/users.yaml']));
    expect(seed.organizations).toEqual([{ slug: 'acme-app', name: 'acme-app' }]);
    expect(seed.users.map((u) => [u.persona, u.orgs])).toEqual([
      ['admin', [{ slug: 'acme-app', role: 'admin' }]],
      ['member', [{ slug: 'acme-app', role: 'member' }]],
    ]);
    expect(new Set(seed.users.map((u) => u.email.toLowerCase())).size).toBe(seed.users.length);
    // A scoped package name still gives a valid slug, and a quoted organization name.
    const scoped = appAuthSeedUsersSchema.parse(parseYaml(projectFiles('@acme/My_App', '^0.1.0', 'ensemble')['seed/users.yaml']));
    expect(scoped.organizations).toEqual([{ slug: 'my-app', name: '@acme/My_App' }]);
  });

  it('derives an organization slug Ensemble accepts', () => {
    expect(organizationSlug('acme-app')).toBe('acme-app');
    expect(organizationSlug('@scope/Big__App.v2')).toBe('big-app-v2');
    expect(organizationSlug('_')).toBe('acme');
    expect(organizationSlug(`x${'-y'.repeat(40)}`)).toMatch(/^[a-z0-9][a-z0-9-]{0,62}$/);
  });

  it('ships a sign-in page whose script compiles and targets the environment auth path', () => {
    const page = files['src/api/pages/sign-in.ts'];
    const js = constant(page, 'SIGN_IN_JS');
    expect(() => new Script(js)).not.toThrow();
    expect(js).toContain(`const AUTH = '${AUTH_PATH}'`);
    for (const endpoint of ['/token?grant_type=password', '/signup?redirect_to=', '/otp?redirect_to=', '/token?grant_type=refresh_token', '/logout']) {
      expect(js).toContain(endpoint);
    }
    expect(constant(page, 'SIGN_IN_HTML')).toContain('<script type="module" src="/api/sign-in/client.js"></script>');
  });

  it('refuses an unknown auth choice before touching the directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mariachi-auth-'));
    try {
      await expect(createProject({ name: 'x', outputDir: join(dir, 'x'), auth: 'clerk' as never })).rejects.toMatchObject({ code: 'create/invalid-auth' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

import { LAYOUT, MARKERS } from '../layout';
import { THIRD_PARTY_VERSIONS as V } from '../version';

const MARIACHI_DEPS = [
  'api-facade',
  'auth',
  'communication',
  'config',
  'core',
  'database',
  'database-postgres',
  'jobs',
  'lifecycle',
] as const;

export function projectFiles(name: string, mariachiRange: string): Record<string, string> {
  const dependencies: Record<string, string> = {};
  for (const pkg of MARIACHI_DEPS) dependencies[`@mariachi/${pkg}`] = mariachiRange;
  dependencies.zod = V.zod;
  dependencies['drizzle-orm'] = V['drizzle-orm'];
  dependencies.postgres = V.postgres;

  const packageJson = {
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'tsx watch --env-file=.env src/main.ts',
      build: 'tsup src/main.ts --format esm --target node20 --clean',
      start: 'node dist/main.js',
      typecheck: 'tsc --noEmit',
      test: 'vitest run',
      'test:watch': 'vitest',
      validate: 'mariachi validate',
      'db:generate': 'mariachi db generate',
      'db:check': 'mariachi db check',
      'db:migrate': 'mariachi db migrate',
      'db:seed': 'mariachi db seed',
    },
    dependencies,
    devDependencies: {
      '@mariachi/cli': mariachiRange,
      '@types/node': V['@types/node'],
      'drizzle-kit': V['drizzle-kit'],
      tsup: V.tsup,
      tsx: V.tsx,
      typescript: V.typescript,
      vitest: V.vitest,
    },
    engines: { node: '>=20.12' },
  };

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022'],
      types: ['node'],
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      skipLibCheck: true,
      isolatedModules: true,
      resolveJsonModule: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ['src'],
  };

  return {
    'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
    'tsconfig.json': `${JSON.stringify(tsconfig, null, 2)}\n`,
    '.gitignore': 'node_modules/\ndist/\n.env\ncoverage/\n',
    '.env.example': ENV_EXAMPLE(name),
    'docker-compose.yml': DOCKER_COMPOSE,
    'vitest.config.ts': VITEST_CONFIG,
    'AGENTS.md': AGENTS_MD,
    'CLAUDE.md': 'See [AGENTS.md](./AGENTS.md).\n',
    'README.md': README(name),
    [LAYOUT.main]: MAIN_TS,
    [LAYOUT.schemaIndex]: `/** Every table exported here is picked up by \`mariachi db generate\`. */\n// ${MARKERS.schema}\nexport {};\n`,
    [LAYOUT.seedsIndex]: SEEDS_INDEX,
    [LAYOUT.servicesIndex]: SERVICES_INDEX,
    [LAYOUT.controllersIndex]: CONTROLLERS_INDEX,
    [LAYOUT.jobsIndex]: JOBS_INDEX,
  };
}

const ENV_EXAMPLE = (name: string) => `SERVICE_NAME=${name}
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/${name.replace(/[^a-z0-9_]/gi, '_')}
REDIS_URL=redis://localhost:6379
# At least 32 characters. Tokens are verified with HS256.
JWT_SECRET=change-me-change-me-change-me-change-me
`;

const DOCKER_COMPOSE = `services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
`;

const VITEST_CONFIG = `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
`;

const AGENTS_MD = `# Agent guide

This is a [Mariachi](https://github.com/) backend. Before writing code, read the framework docs shipped
with \`@mariachi/core\`:

- \`node_modules/@mariachi/core/docs/README.md\` (start here: layers, conventions, package catalog)
- \`node_modules/@mariachi/core/docs/recipes/\` (step-by-step: entity, job, webhook, integration)

## Layout

| Path | Layer |
| --- | --- |
| \`src/main.ts\` | Composition root: config, lifecycle, database, jobs, communication, HTTP server |
| \`src/contracts/\` | Zod schemas + procedure types shared by controllers and handlers |
| \`src/api/controllers/\` | HTTP controllers (\`BaseController\`); call procedures, never services |
| \`src/services/<name>/\` | Service, repository and communication handlers for one domain |
| \`src/schema/\` | \`defineTable\` tables; \`mariachi db generate\` turns them into migrations |
| \`src/jobs/\` | \`defineJob\` background jobs |

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

\`\`\`bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:generate && pnpm db:migrate
pnpm dev
\`\`\`

The API listens on \`PORT\` (default 3000) under \`/api\`. Health checks: \`/api/health/live\`,
\`/api/health/ready\`, \`/api/health/startup\`. OpenAPI: \`/api/openapi.json\`.
`;

const MAIN_TS = `import { ConfigError, KEYS } from '@mariachi/core';
import { bootstrap } from '@mariachi/lifecycle';
import { createCommunication } from '@mariachi/communication';
import { createPostgresDatabase } from '@mariachi/database-postgres';
import { createJobQueue, DefaultJobs } from '@mariachi/jobs';
import { JWTAdapter } from '@mariachi/auth';
import { bearerStrategy, createApiServer } from '@mariachi/api-facade';
import { createControllers } from './api/controllers/index';
import { registerServices } from './services/index';
import { jobs as jobDefinitions } from './jobs/index';

async function main(): Promise<void> {
  const { config, logger, tracer, metrics, container, lifecycle } = bootstrap();
  const instrumentation = { logger, tracer, metrics };

  if (!config.database) throw new ConfigError('app/database-required', 'DATABASE_URL is required');
  if (!config.redis) throw new ConfigError('app/redis-required', 'REDIS_URL is required');
  if (!config.auth?.jwtSecret) throw new ConfigError('app/jwt-secret-required', 'JWT_SECRET is required');

  // Startup runs in ascending priority; shutdown runs in reverse.
  const database = lifecycle.manage(
    'database',
    createPostgresDatabase({ url: config.database.url, poolMin: config.database.poolMin, poolMax: config.database.poolMax }),
    { priority: 10 },
  );
  container.register(KEYS.Database, database);

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
  registerServices(communication, { db: database.db, jobs });

  const api = createApiServer({
    name: 'api',
    prefix: '/api',
    logger,
    tracer,
    trustProxy: config.server.trustProxy,
    bodyLimitBytes: config.server.bodyLimitBytes,
    cors: config.server.corsOrigins.length > 0 ? { origins: config.server.corsOrigins } : false,
  })
    .withAuthStrategy(
      'session',
      bearerStrategy(new JWTAdapter({ secret: config.auth.jwtSecret, issuer: config.auth.jwtIssuer, audience: config.auth.jwtAudience })),
    )
    .withAuth('session')
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

const SEEDS_INDEX = `import type { SeedDefinition } from '@mariachi/database';

/** Seeds run by \`mariachi db seed\`, each once per environment. Create them with \`defineSeed\`. */
export const seeds: SeedDefinition[] = [];
`;

const SERVICES_INDEX = `import type { CommunicationLayer } from '@mariachi/communication';
import type { DrizzleDb } from '@mariachi/database-postgres';
import type { Jobs } from '@mariachi/jobs';
// ${MARKERS.imports}

export interface ServiceDeps {
  db: DrizzleDb;
  jobs: Jobs;
}

/** Wires every domain service and registers its communication handlers. */
export function registerServices(communication: CommunicationLayer, deps: ServiceDeps): void {
  // ${MARKERS.services}
}
`;

const CONTROLLERS_INDEX = `import type { BaseController } from '@mariachi/api-facade';
import type { CommunicationLayer } from '@mariachi/communication';
// ${MARKERS.imports}

export function createControllers(communication: CommunicationLayer): BaseController[] {
  return [
    // ${MARKERS.controllers}
  ];
}
`;

const JOBS_INDEX = `import type { JobDefinition } from '@mariachi/jobs';
// ${MARKERS.imports}

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous job payloads
export const jobs: JobDefinition<any>[] = [
  // ${MARKERS.jobs}
];
`;

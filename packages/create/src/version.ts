import { createRequire } from 'node:module';

/** All `@mariachi/*` packages are versioned together, so this package's version is the framework's. */
export const MARIACHI_VERSION: string = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

/** Third-party versions a generated project installs; kept in step with the monorepo. */
export const THIRD_PARTY_VERSIONS = {
  zod: '^3.24.0',
  'drizzle-orm': '^0.38.0',
  'drizzle-kit': '^0.30.0',
  postgres: '^3.4.0',
  typescript: '^5.7.0',
  tsx: '^4.19.0',
  tsup: '^8.3.0',
  vitest: '^3.0.0',
  '@types/node': '^22.0.0',
} as const;

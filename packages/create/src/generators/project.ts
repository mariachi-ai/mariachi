import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectConfig } from '../types';

const MARIACHI_VERSION = '0.1.0';

export async function createProject(config: ProjectConfig): Promise<void> {
  const root = config.outputDir;

  const dirs = [
    join(root, 'apps', 'api', 'servers'),
    join(root, 'apps', 'api', 'controllers'),
    join(root, 'apps', 'services'),
    join(root, 'apps', 'worker', 'jobs'),
    join(root, 'packages'),
    join(root, 'integrations'),
    join(root, 'docs'),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  const packageJson = {
    name: config.name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      build: 'turbo run build',
      dev: 'turbo run dev',
      test: 'vitest',
      'test:run': 'vitest run',
      lint: 'turbo run lint',
      clean: 'turbo run clean',
      typecheck: 'turbo run typecheck',
    },
    devDependencies: {
      turbo: '^2',
      typescript: '^5.7',
      tsup: '^8',
      vitest: '^3',
      '@types/node': '^22',
    },
    packageManager: 'pnpm@9.15.4',
    engines: { node: '>=20' },
  };

  const tsconfigBase = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      lib: ['ES2022'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      outDir: './dist',
      rootDir: './src',
      composite: true,
    },
    exclude: ['node_modules', 'dist'],
  };

  const pnpmWorkspace = {
    packages: ['packages/*', 'apps/*', 'integrations'],
  };

  const turboJson = {
    $schema: 'https://turbo.build/schema.json',
    tasks: {
      build: { dependsOn: ['^build'], outputs: ['dist/**'] },
      dev: { cache: false, persistent: true },
      test: { dependsOn: ['^build'], cache: false },
      typecheck: { dependsOn: ['^build'] },
      lint: { dependsOn: ['^build'] },
      clean: { cache: false },
    },
  };

  await writeFile(
    join(root, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
  await writeFile(
    join(root, 'tsconfig.base.json'),
    JSON.stringify(tsconfigBase, null, 2)
  );
  await writeFile(
    join(root, 'pnpm-workspace.yaml'),
    `packages:\n  - "packages/*"\n  - "apps/*"\n  - "integrations"\n`
  );
  await writeFile(
    join(root, 'turbo.json'),
    JSON.stringify(turboJson, null, 2)
  );

  const apiIndex = `import { createContext } from '@mariachi/core';

export async function bootstrap() {
  const ctx = createContext({
    logger: console as any,
    traceId: crypto.randomUUID(),
  });
  return ctx;
}
`;

  await writeFile(join(root, 'apps', 'api', 'index.ts'), apiIndex);
}

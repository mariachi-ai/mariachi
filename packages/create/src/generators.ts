import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ConfigError } from '@mariachi/core';
import { LAYOUT, MARKERS } from './layout';
import { names } from './names';
import { entityFiles } from './templates/entity';
import { controllerFile, integrationFiles, jobFile, serviceFiles } from './templates/parts';
import { projectFiles } from './templates/project';
import type {
  GenerateControllerConfig,
  GenerateEntityConfig,
  GenerateIntegrationConfig,
  GenerateJobConfig,
  GenerateResult,
  GenerateServiceConfig,
  ProjectConfig,
} from './types';
import { MARIACHI_VERSION } from './version';
import { mergeResults, writeFiles, type Insertion } from './writer';

const NPM_NAME = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/** Scaffolds a runnable project and, unless `example: false`, a `note` entity wired end to end. */
export async function createProject(config: ProjectConfig): Promise<GenerateResult> {
  if (!NPM_NAME.test(config.name)) {
    throw new ConfigError('create/invalid-name', `"${config.name}" is not a valid npm package name`);
  }
  if (existsSync(config.outputDir) && (await readdir(config.outputDir)).length > 0) {
    throw new ConfigError('create/dir-not-empty', `${config.outputDir} already exists and is not empty`);
  }
  await mkdir(config.outputDir, { recursive: true });
  const range = config.mariachiVersion ?? `^${MARIACHI_VERSION}`;
  const project = await writeFiles(config.outputDir, projectFiles(config.name, range));
  if (config.example === false) return project;
  const example = await generateEntity({ name: 'note', projectRoot: config.outputDir });
  return { ...mergeResults(project, example), updated: [] };
}

function assertProject(root: string): void {
  if (!existsSync(join(root, 'src'))) {
    throw new ConfigError('create/not-a-project', `${root} has no src/ directory; run this from a project created by \`mariachi init\``);
  }
}

/** Table, contract, repository, service, handlers, controller and a service test; registers all of them. */
export async function generateEntity(config: GenerateEntityConfig): Promise<GenerateResult> {
  assertProject(config.projectRoot);
  const n = names(config.name);
  const svc = `./${n.pluralKebab}/${n.pluralKebab}`;
  const insertions: Insertion[] = [
    { file: LAYOUT.schemaIndex, marker: MARKERS.schema, line: `export * from './${n.pluralKebab}';` },
    { file: LAYOUT.servicesIndex, marker: MARKERS.imports, line: `import { ${n.pluralPascal}Repository } from '${svc}.repository';` },
    { file: LAYOUT.servicesIndex, marker: MARKERS.imports, line: `import { ${n.pluralPascal}Service } from '${svc}.service';` },
    { file: LAYOUT.servicesIndex, marker: MARKERS.imports, line: `import { register${n.pluralPascal}Handlers } from '${svc}.handler';` },
    {
      file: LAYOUT.servicesIndex,
      marker: MARKERS.services,
      line: `register${n.pluralPascal}Handlers(communication, new ${n.pluralPascal}Service(new ${n.pluralPascal}Repository(deps.db)));`,
    },
    ...controllerInsertions(n.pluralPascal, n.pluralKebab),
  ];
  const result = await writeFiles(config.projectRoot, entityFiles(n), insertions, config);
  result.notes.push('Run `mariachi db generate` to create the migration for the new table.');
  return result;
}

/** A service with one `<name>.execute` procedure, its contract, handler and test. */
export async function generateService(config: GenerateServiceConfig): Promise<GenerateResult> {
  assertProject(config.projectRoot);
  const n = names(config.name);
  const svc = `./${n.kebab}/${n.kebab}`;
  return writeFiles(
    config.projectRoot,
    serviceFiles(n),
    [
      { file: LAYOUT.servicesIndex, marker: MARKERS.imports, line: `import { ${n.pascal}Service } from '${svc}.service';` },
      { file: LAYOUT.servicesIndex, marker: MARKERS.imports, line: `import { register${n.pascal}Handlers } from '${svc}.handler';` },
      { file: LAYOUT.servicesIndex, marker: MARKERS.services, line: `register${n.pascal}Handlers(communication, new ${n.pascal}Service());` },
    ],
    config,
  );
}

/** A controller calling `<name>.execute`; reuses `src/contracts/<name>.ts` when the service exists. */
export async function generateController(config: GenerateControllerConfig): Promise<GenerateResult> {
  assertProject(config.projectRoot);
  const n = names(config.name);
  const withContract = existsSync(join(config.projectRoot, LAYOUT.contractsDir, `${n.kebab}.ts`));
  return writeFiles(
    config.projectRoot,
    { [`${LAYOUT.controllersDir}/${n.kebab}.controller.ts`]: controllerFile(n, withContract) },
    controllerInsertions(n.pascal, n.kebab),
    config,
  );
}

function controllerInsertions(pascal: string, file: string): Insertion[] {
  return [
    { file: LAYOUT.controllersIndex, marker: MARKERS.imports, line: `import { ${pascal}Controller } from './${file}.controller';` },
    { file: LAYOUT.controllersIndex, marker: MARKERS.controllers, line: `new ${pascal}Controller(communication),` },
  ];
}

export async function generateJob(config: GenerateJobConfig): Promise<GenerateResult> {
  assertProject(config.projectRoot);
  const n = names(config.name);
  return writeFiles(
    config.projectRoot,
    { [`${LAYOUT.jobsDir}/${n.kebab}.job.ts`]: jobFile(n) },
    [
      { file: LAYOUT.jobsIndex, marker: MARKERS.imports, line: `import { ${n.camel}Job } from './${n.kebab}.job';` },
      { file: LAYOUT.jobsIndex, marker: MARKERS.jobs, line: `${n.camel}Job,` },
    ],
    config,
  );
}

/** An HTTP client with timeouts, retries and typed errors, plus tests. Not wired automatically. */
export async function generateIntegration(config: GenerateIntegrationConfig): Promise<GenerateResult> {
  assertProject(config.projectRoot);
  const n = names(config.name);
  const result = await writeFiles(config.projectRoot, integrationFiles(n), [], config);
  result.notes.push(`Construct ${n.pascal}Client in src/main.ts with credentials from config or secrets and pass it to the services that need it.`);
  return result;
}

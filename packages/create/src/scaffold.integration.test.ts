import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject, generateController, generateEntity, generateIntegration, generateJob, generateService, validate } from './index';

const run = promisify(execFile);
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Inside this package so `@mariachi/*`, zod, drizzle-orm and @types/node resolve from its node_modules.
const workDir = join(pkgRoot, '.scaffold-test');
const project = join(workDir, 'app');

async function sh(bin: string, args: string[]) {
  try {
    return await run(process.execPath, [join(pkgRoot, 'node_modules', bin), ...args], {
      cwd: project,
      maxBuffer: 16 * 1024 * 1024,
      // Turbo sets FORCE_COLOR; ANSI codes would break the output assertions.
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    throw new Error(`${bin} failed:\n${e.stdout ?? ''}\n${e.stderr ?? ''}`); // mariachi-lint-ignore
  }
}

describe('generated project', () => {
  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    await createProject({ name: 'scaffold-app', outputDir: project });
    await generateService({ name: 'billing-report', projectRoot: project });
    await generateController({ name: 'billing-report', projectRoot: project });
    await generateController({ name: 'status', projectRoot: project });
    await generateEntity({ name: 'invoice-item', projectRoot: project });
    await generateJob({ name: 'send-digest', projectRoot: project });
    await generateIntegration({ name: 'acme', projectRoot: project });
  }, 30_000);

  afterAll(() => rm(workDir, { recursive: true, force: true }));

  it('registers generated pieces in the registry files', async () => {
    const services = await readFile(join(project, 'src/services/index.ts'), 'utf-8');
    expect(services).toContain('registerNotesHandlers(communication, new NotesService(new NotesRepository(deps.db)));');
    expect(services).toContain('registerInvoiceItemsHandlers(');
    expect(services).toContain('registerBillingReportHandlers(communication, new BillingReportService());');
    const controllers = await readFile(join(project, 'src/api/controllers/index.ts'), 'utf-8');
    expect(controllers).toMatch(/new NotesController\(communication\),\n\s+new BillingReportController\(communication\),/);
    expect(await readFile(join(project, 'src/schema/index.ts'), 'utf-8')).toContain("export * from './invoice-items';");
    expect(await readFile(join(project, 'src/jobs/index.ts'), 'utf-8')).toContain('sendDigestJob,');
    const pkg = JSON.parse(await readFile(join(project, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['@mariachi/core']).toMatch(/^\^\d+\.\d+\.\d+/);
  });

  it('refuses to overwrite and leaves registries untouched', async () => {
    const before = await readFile(join(project, 'src/services/index.ts'), 'utf-8');
    await expect(generateEntity({ name: 'note', projectRoot: project })).rejects.toMatchObject({ code: 'create/file-exists' });
    expect(await readFile(join(project, 'src/services/index.ts'), 'utf-8')).toBe(before);
  });

  it('typechecks against the current framework packages', async () => {
    await sh('typescript/bin/tsc', ['-p', 'tsconfig.json']);
  }, 120_000);

  it('passes its own generated tests', async () => {
    const { stdout } = await sh('vitest/vitest.mjs', ['run', '--root', project]);
    expect(stdout).toMatch(/Tests\s+\d+ passed/);
  }, 120_000);

  it('passes mariachi validate with no findings', async () => {
    const result = await validate(project);
    expect(result.violations).toEqual([]);
    expect(result.filesChecked).toBeGreaterThan(15);
  });

  it('flags a controller that imports a service', async () => {
    const file = join(project, 'src/api/controllers/notes.controller.ts');
    const original = await readFile(file, 'utf-8');
    await writeFile(file, `import { NotesService } from '../../services/notes/notes.service';\n${original}`);
    try {
      const result = await validate(project);
      expect(result.valid).toBe(false);
      expect(result.violations).toMatchObject([{ rule: 'no-service-import-in-controller', file: 'src/api/controllers/notes.controller.ts', line: 1 }]);
    } finally {
      await writeFile(file, original);
    }
  });
});

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Violation } from '../../types';

const DB_IMPORT = /from\s+['"]@mariachi\/database(?:-postgres)?['"]|require\s*\(\s*['"]@mariachi\/database(?:-postgres)?['"]\s*\)/;
const HTTP_IMPORT = /from\s+['"]fastify['"]|require\s*\(\s*['"]fastify['"]\s*\)|from\s+['"]express['"]|require\s*\(\s*['"]express['"]\s*\)|from\s+['"]hono['"]|require\s*\(\s*['"]hono['"]\s*\)/;

export async function checkNoDbInController(
  projectRoot: string,
  files: string[]
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const controllerFiles = files.filter(
    (f) =>
      f.includes('apps/api/controllers/') || f.includes('apps\\api\\controllers\\')
  );
  for (const file of controllerFiles) {
    const content = await readFile(join(projectRoot, file), 'utf-8');
    if (DB_IMPORT.test(content)) {
      violations.push({
        rule: 'no-db-in-controller',
        severity: 'error',
        file,
        message: 'Controllers may not import @mariachi/database',
        suggestion: 'Move database access to a service layer',
      });
    }
  }
  return violations;
}

export async function checkNoDbInFacade(
  projectRoot: string,
  files: string[]
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const facadeFiles = files.filter(
    (f) =>
      f.includes('apps/api/servers/') ||
      f.includes('apps\\api\\servers\\') ||
      f.includes('api-facade')
  );
  for (const file of facadeFiles) {
    const content = await readFile(join(projectRoot, file), 'utf-8');
    if (DB_IMPORT.test(content)) {
      violations.push({
        rule: 'no-db-in-facade',
        severity: 'error',
        file,
        message: 'Facade files may not import @mariachi/database',
        suggestion: 'Move database access to a service layer',
      });
    }
  }
  return violations;
}

export async function checkNoHttpInService(
  projectRoot: string,
  files: string[]
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const serviceFiles = files.filter(
    (f) =>
      (f.includes('apps/services/') || f.includes('apps\\services\\')) &&
      f.endsWith('.service.ts')
  );
  for (const file of serviceFiles) {
    const content = await readFile(join(projectRoot, file), 'utf-8');
    if (HTTP_IMPORT.test(content)) {
      violations.push({
        rule: 'no-http-in-service',
        severity: 'error',
        file,
        message: 'Services may not import fastify, express, or other HTTP frameworks',
        suggestion: 'Keep HTTP concerns in controllers and facade',
      });
    }
  }
  return violations;
}

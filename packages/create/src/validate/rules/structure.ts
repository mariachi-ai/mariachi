import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Violation } from '../../types';

export async function checkHandlerForEveryService(
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
    const baseName = file.replace(/\.service\.ts$/, '');
    const handlerPath = baseName + '.handler.ts';
    const fullHandlerPath = join(projectRoot, handlerPath);
    if (!existsSync(fullHandlerPath)) {
      violations.push({
        rule: 'handler-for-every-service',
        severity: 'error',
        file,
        message: `Service ${file} has no corresponding handler file`,
        suggestion: `Create ${handlerPath}`,
      });
    }
  }
  return violations;
}

export async function checkTestForEveryService(
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
    const dir = dirname(file);
    const baseName = file.replace(/\.service\.ts$/, '').split(/[/\\]/).pop() ?? '';
    const testPath = join(dir, 'test', `${baseName}.service.test.ts`);
    const fullTestPath = join(projectRoot, testPath);
    if (!existsSync(fullTestPath)) {
      violations.push({
        rule: 'test-for-every-service',
        severity: 'warning',
        file,
        message: `Service ${file} has no corresponding test file`,
        suggestion: `Create test/${baseName}.service.test.ts`,
      });
    }
  }
  return violations;
}

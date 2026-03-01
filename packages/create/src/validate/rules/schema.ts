import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Violation } from '../../types';

const PROCESS_ENV = /process\.env\b/;

export async function checkNoProcessEnv(
  projectRoot: string,
  files: string[]
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const configFiles = files.filter(
    (f) =>
      f.includes('packages/config/') || f.includes('packages\\config\\')
  );
  const configPaths = new Set(configFiles.map((f) => join(projectRoot, f)));

  for (const file of files) {
    if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;
    const fullPath = join(projectRoot, file);
    const isInConfig = [...configPaths].some((p) => fullPath.startsWith(p) || file.includes('packages/config/'));
    if (isInConfig) continue;

    const content = await readFile(join(projectRoot, file), 'utf-8');
    if (PROCESS_ENV.test(content)) {
      violations.push({
        rule: 'no-process-env',
        severity: 'error',
        file,
        message: 'process.env must not be used outside packages/config/',
        suggestion: 'Use the config package to resolve environment variables',
      });
    }
  }
  return violations;
}

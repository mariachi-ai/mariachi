import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ValidationResult, Violation } from '../types';
import { checkNoDbInController, checkNoDbInFacade, checkNoHttpInService } from './rules/imports';
import { checkHandlerForEveryService, checkTestForEveryService } from './rules/structure';
import { checkEventFormat, checkTimestamps } from './rules/naming';
import { checkNoProcessEnv } from './rules/schema';

async function collectFiles(dir: string, base = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      files.push(...(await collectFiles(join(dir, entry.name), rel)));
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      files.push(rel);
    }
  }
  return files;
}

export async function validate(projectRoot: string): Promise<ValidationResult> {
  const files = await collectFiles(projectRoot);
  const violations: Violation[] = [];

  const results = await Promise.all([
    checkNoDbInController(projectRoot, files),
    checkNoDbInFacade(projectRoot, files),
    checkNoHttpInService(projectRoot, files),
    checkHandlerForEveryService(projectRoot, files),
    checkTestForEveryService(projectRoot, files),
    checkEventFormat(projectRoot, files),
    checkTimestamps(projectRoot, files),
    checkNoProcessEnv(projectRoot, files),
  ]);

  for (const result of results) {
    violations.push(...result);
  }

  return {
    valid: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
  };
}

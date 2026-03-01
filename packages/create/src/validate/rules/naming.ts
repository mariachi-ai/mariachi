import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Violation } from '../../types';

const EVENT_PUBLISH = /events\.publish\s*\(\s*['"`]([^'"`]+)['"`]/g;
const EVENT_FORMAT = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/;

export async function checkEventFormat(
  projectRoot: string,
  files: string[]
): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const file of files) {
    if (!file.endsWith('.ts')) continue;
    const content = await readFile(join(projectRoot, file), 'utf-8');
    let match: RegExpExecArray | null;
    EVENT_PUBLISH.lastIndex = 0;
    while ((match = EVENT_PUBLISH.exec(content)) !== null) {
      const eventName = match[1];
      if (!EVENT_FORMAT.test(eventName)) {
        violations.push({
          rule: 'event-format',
          severity: 'warning',
          file,
          message: `Event name "${eventName}" does not match domain.entity.verb format`,
          suggestion: 'Use format like billing.charge.created',
        });
      }
    }
  }
  return violations;
}

const WRONG_TIMESTAMP = /\.(createdAt|updatedAt|deletedAt)\b/;

export async function checkTimestamps(
  projectRoot: string,
  files: string[]
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const schemaFiles = files.filter(
    (f) =>
      f.includes('schema/') ||
      f.includes('packages/database/') ||
      f.endsWith('.schema.ts') ||
      f.includes('.schema.')
  );
  for (const file of schemaFiles) {
    if (!file.endsWith('.ts')) continue;
    const content = await readFile(join(projectRoot, file), 'utf-8');
    if (WRONG_TIMESTAMP.test(content)) {
      violations.push({
        rule: 'timestamps',
        severity: 'warning',
        file,
        message: 'DB columns should use created_at, updated_at, deleted_at (snake_case)',
        suggestion: 'Rename to created_at, updated_at, deleted_at',
      });
    }
  }
  return violations;
}

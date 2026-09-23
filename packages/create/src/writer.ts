import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { ConfigError } from '@mariachi/core';
import type { GenerateResult } from './types';

/** A registry file edit: `line` is inserted above the first line containing `marker`. */
export interface Insertion {
  file: string;
  marker: string;
  line: string;
}

/**
 * Writes generated files under `root`. Nothing is written if any target already exists
 * (unless `force`), so a failed generate never leaves a half-written feature behind.
 */
export async function writeFiles(
  root: string,
  files: Record<string, string>,
  insertions: Insertion[] = [],
  options: { force?: boolean } = {},
): Promise<GenerateResult> {
  const result: GenerateResult = { created: [], updated: [], notes: [] };
  const existing = Object.keys(files).filter((f) => existsSync(join(root, f)));
  if (existing.length > 0 && !options.force) {
    throw new ConfigError('create/file-exists', `Refusing to overwrite: ${existing.join(', ')} (use --force)`, { files: existing });
  }

  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    result.created.push(file);
  }

  for (const ins of insertions) {
    const path = join(root, ins.file);
    if (!existsSync(path)) {
      result.notes.push(`${ins.file} not found; add manually: ${ins.line.trim()}`);
      continue;
    }
    const content = await readFile(path, 'utf-8');
    if (content.includes(ins.line.trim())) continue;
    const lines = content.split('\n');
    const at = lines.findIndex((l) => l.includes(ins.marker));
    if (at === -1) {
      result.notes.push(`${ins.file} has no "${ins.marker}" marker; add manually: ${ins.line.trim()}`);
      continue;
    }
    const indent = lines[at].match(/^\s*/)?.[0] ?? '';
    lines.splice(at, 0, `${indent}${ins.line.trim()}`);
    await writeFile(path, lines.join('\n'));
    if (!result.updated.includes(ins.file)) result.updated.push(ins.file);
  }
  return result;
}

export function relativeImport(fromFile: string, toFile: string): string {
  const rel = relative(dirname(fromFile), toFile).replace(/\\/g, '/').replace(/\.tsx?$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

export function mergeResults(...results: GenerateResult[]): GenerateResult {
  return {
    created: results.flatMap((r) => r.created),
    updated: [...new Set(results.flatMap((r) => r.updated))],
    notes: results.flatMap((r) => r.notes),
  };
}

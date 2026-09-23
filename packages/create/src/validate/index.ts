import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ValidateOptions, ValidationResult, Violation } from '../types';
import { RULES, type SourceFile } from './rules';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.turbo', 'coverage', 'drizzle', '.next']);
const SOURCE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;

async function collect(root: string, dir = ''): Promise<string[]> {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...(await collect(root, rel)));
    } else if (entry.isFile() && SOURCE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(rel);
    }
  }
  return files;
}

const IMPORT_PATTERNS = [
  /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

export function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

export function parseSource(path: string, content: string): SourceFile {
  const imports: SourceFile['imports'] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const at = (match.index ?? 0) + match[0].length - 1;
      imports.push({ spec: match[1], line: lineAt(content, at) });
    }
  }
  return { path: path.replace(/\\/g, '/'), content, lines: content.split('\n'), imports };
}

const IGNORE = /mariachi-(?:validate|lint)-ignore(?:\s+([\w\s,-]+))?/;

function ignored(file: SourceFile, v: Violation): boolean {
  if (!v.line) return false;
  for (const idx of [v.line - 1, v.line - 2]) {
    const m = file.lines[idx]?.match(IGNORE);
    if (!m) continue;
    const listed = m[1]?.split(/[\s,]+/).filter((r) => RULES.some((rule) => rule.name === r));
    if (!listed || listed.length === 0 || listed.includes(v.rule)) return true;
  }
  return false;
}

/**
 * Checks a project against Mariachi's architecture rules. Suppress a finding with a
 * `// mariachi-validate-ignore <rule>` comment on the same or preceding line.
 */
export async function validate(projectRoot: string, options: ValidateOptions = {}): Promise<ValidationResult> {
  const paths = await collect(projectRoot);
  const files = await Promise.all(paths.map(async (p) => parseSource(p, await readFile(join(projectRoot, p), 'utf-8'))));
  const byPath = new Map(files.map((f) => [f.path, f]));
  const disabled = new Set(options.disable ?? []);

  const violations: Violation[] = [];
  for (const rule of RULES) {
    if (disabled.has(rule.name)) continue;
    for (const v of rule.check(files, new Set(byPath.keys()))) {
      const file = byPath.get(v.file);
      if (!file || !ignored(file, v)) violations.push(v);
    }
  }
  violations.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  return { valid: !violations.some((v) => v.severity === 'error'), violations, filesChecked: files.length };
}

export { RULES } from './rules';

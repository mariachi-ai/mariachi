#!/usr/bin/env node
/**
 * Mariachi convention linter. Rules:
 *   no-raw-error         `throw new Error(` in framework source
 *   no-process-env       `process.env` outside @mariachi/config (and app entry points)
 *   no-js-extension      relative imports ending in `.js`
 *   no-controller-service controllers importing from services
 */
import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['packages', 'apps', 'integrations'];
const violations = [];

const PROCESS_ENV_ALLOWED = [
  /^packages\/config\//,
  /^packages\/create\//,
  /^packages\/cli\//,
  /^apps\/[^/]+\/src\/(index|main)\.ts$/,
  /^integrations\/scripts\//,
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (['node_modules', 'dist', '.turbo', 'templates'].includes(e.name)) return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') ? [p] : [];
  });
}

for (const file of roots.flatMap(walk)) {
  const rel = file.split(path.sep).join('/');
  const isTest = /\.(test|spec)\.ts$/.test(rel) || rel.includes('/test/') || rel.includes('/__tests__/');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const loc = `${rel}:${i + 1}`;
    if (line.includes('mariachi-lint-ignore')) return;
    if (!isTest && /throw new Error\(/.test(line)) violations.push(`${loc} no-raw-error: throw a MariachiError subclass`);
    if (!isTest && /process\.env/.test(line) && !PROCESS_ENV_ALLOWED.some((r) => r.test(rel))) {
      violations.push(`${loc} no-process-env: use loadConfig()/useConfig()`);
    }
    if (/from\s+['"]\.{1,2}\/[^'"]+\.js['"]/.test(line)) violations.push(`${loc} no-js-extension: relative imports are extensionless`);
    if (/\/controllers\//.test(rel) && /from\s+['"][^'"]*services?\//.test(line) && !/@mariachi\//.test(line)) {
      violations.push(`${loc} no-controller-service: controllers must use communication.call()`);
    }
  });
}

if (violations.length) {
  console.error(violations.join('\n'));
  console.error(`\n${violations.length} convention violation(s).`);
  process.exit(1);
}
console.log('Conventions OK.');

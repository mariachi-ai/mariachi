#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const packageReadmes = fs
  .readdirSync('packages')
  .map((dir) => `packages/${dir}/README.md`)
  .filter((file) => fs.existsSync(file));

const roots = ['.cursor/rules', 'packages/core/docs', ...packageReadmes, 'README.md', 'CLAUDE.md', 'ROADMAP.md'];
const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
const pathRe = /`((?:packages|integrations|scripts|docs|\.mariachi)\/[\w./-]+\.(?:md|mjs|ts))`/g;
let broken = 0;
let checked = 0;

function collect(target) {
  if (!fs.existsSync(target)) return [];
  if (fs.statSync(target).isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(target, e.name);
    if (e.isDirectory()) return collect(p);
    return /\.mdc?$/.test(e.name) ? [p] : [];
  });
}

function check(file, href, base) {
  const clean = href.split('#')[0].split('?')[0];
  if (!clean || /^(https?:|mailto:)/.test(clean) || clean.startsWith('node_modules/')) return;
  checked++;
  if (!fs.existsSync(path.resolve(base, clean))) {
    console.error(`BROKEN: ${file} -> ${href}`);
    broken++;
  }
}

for (const file of roots.flatMap(collect)) {
  const content = fs.readFileSync(file, 'utf8');
  for (const m of content.matchAll(linkRe)) check(file, m[1], path.dirname(file));
  // Backticked repo paths in root-level agent docs are resolved from the repo root.
  if (!file.startsWith('packages/core/')) {
    for (const m of content.matchAll(pathRe)) check(file, m[1], '.');
  }
}

console.log(`Checked ${checked} links.`);
if (broken > 0) {
  console.error(`${broken} broken link(s).`);
  process.exit(1);
}

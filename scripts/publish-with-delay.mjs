#!/usr/bin/env node
/**
 * Publishes all non-private packages under packages/ to npm with a delay between
 * each publish to avoid npm rate limits (429 Too Many Requests).
 * Publishes in topological order (dependencies before dependents).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const packagesDir = path.join(root, 'packages');

const DELAY_SECONDS = Number(process.env.NPM_PUBLISH_DELAY_SECONDS) || 5;

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function getPackages() {
  const dirs = fs.readdirSync(packagesDir, { withFileTypes: true });
  const packages = [];
  for (const ent of dirs) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(packagesDir, ent.name);
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) continue;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.private) continue;
    packages.push({ dir, name: pkg.name, deps: pkg.dependencies || {} });
  }
  return packages;
}

function topologicalSort(packages) {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const order = [];
  const visited = new Set();

  function visit(name) {
    if (visited.has(name)) return;
    const p = byName.get(name);
    if (!p) return;
    for (const dep of Object.keys(p.deps)) {
      if (dep.startsWith('@mariachi/') && byName.has(dep)) visit(dep);
    }
    visited.add(name);
    order.push(p.dir);
  }

  for (const p of packages) visit(p.name);
  return order;
}

function getPublishOrder() {
  const packages = getPackages();
  return topologicalSort(packages);
}

async function main() {
  const dirs = getPublishOrder();
  console.log(`Publishing ${dirs.length} packages with ${DELAY_SECONDS}s delay between each...`);
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    console.log(`[${i + 1}/${dirs.length}] ${pkg.name}...`);
    const r = spawnSync('pnpm', ['publish', '--no-git-checks', '--access', 'public'], {
      cwd: dir,
      stdio: 'inherit',
      env: { ...process.env, NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN },
    });
    if (r.status !== 0) {
      console.error(`Failed to publish ${pkg.name}`);
      process.exit(1);
    }
    if (i < dirs.length - 1) {
      await sleep(DELAY_SECONDS);
    }
  }
  console.log('All packages published.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

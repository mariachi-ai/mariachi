#!/usr/bin/env node
/**
 * Bumps patch version for all packages under packages/.
 * Reads current version from npm (@mariachi/core) or falls back to 0.0.0.
 * Used by CI on push to main to publish a new patch release.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const packagesDir = path.join(root, 'packages');

function getLatestPublishedVersion() {
  try {
    return execSync('npm view @mariachi/core version', { encoding: 'utf-8' }).trim();
  } catch {
    return '0.0.0';
  }
}

function bumpPatch(version) {
  const parts = version.split('.').map(Number);
  const [major = 0, minor = 0, patch = 0] = parts;
  return `${major}.${minor}.${patch + 1}`;
}

function updatePackageJson(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  if (pkg.private) return;
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

const current = getLatestPublishedVersion();
const newVersion = bumpPatch(current);
console.log(`Bumping packages from ${current} to ${newVersion}`);

const entries = fs.readdirSync(packagesDir, { withFileTypes: true });
for (const ent of entries) {
  if (ent.isDirectory()) {
    updatePackageJson(path.join(packagesDir, ent.name));
  }
}

console.log(`Updated all package versions to ${newVersion}`);

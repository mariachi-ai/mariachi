// Reads every package's `package.json` metadata (`description` and `mariachi` fields).
// Shared by scripts/generate-catalog.mjs and the @mariachi/explorer `packages` loader, so the
// markdown catalog and the explorer can't disagree.
import fs from 'node:fs';
import path from 'node:path';

export const CATEGORIES = {
  foundation: 'Foundation',
  http: 'HTTP and communication',
  data: 'Data and storage',
  async: 'Events, jobs and realtime',
  security: 'Security and access',
  domain: 'Domain features',
  design: 'Design',
  tooling: 'Tooling',
};
export const STATUSES = {
  beta: 'Hardened and covered by unit and integration tests. The API can still change before 1.0.',
  alpha: 'Works, but hardening is in progress. Expect breaking changes.',
};

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [fs.readFileSync(p, 'utf8')] : [];
  });
}

function isExported(src, name) {
  const decl = new RegExp(`export\\s+(?:declare\\s+)?(?:async\\s+)?(?:abstract\\s+)?(?:function|class|const|let)\\s+${name}\\b`);
  const list = new RegExp(`export\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}`);
  return src.some((s) => decl.test(s) || list.test(s));
}

/**
 * Returns `{ packages, errors }`. Each package has `dir`, `name`, `version`, `description`,
 * `hasReadme`, the `mariachi` fields (`category`, `status`, `useWhen`, `entry`) and the raw
 * `package.json` as `pkg`. `root` is the repo root.
 */
export function readPackages(root = process.cwd()) {
  const errors = [];
  const packagesDir = path.join(root, 'packages');
  const packages = fs
    .readdirSync(packagesDir)
    .filter((d) => fs.existsSync(path.join(packagesDir, d, 'package.json')))
    .map((dir) => {
      const base = path.join(packagesDir, dir);
      const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
      const m = pkg.mariachi;
      if (!pkg.description) errors.push(`${pkg.name}: missing "description"`);
      if (!m) {
        errors.push(`${pkg.name}: missing "mariachi" metadata`);
        return null;
      }
      if (!CATEGORIES[m.category]) errors.push(`${pkg.name}: unknown category "${m.category}"`);
      if (!STATUSES[m.status]) errors.push(`${pkg.name}: unknown status "${m.status}"`);
      if (!m.useWhen) errors.push(`${pkg.name}: missing mariachi.useWhen`);
      const src = fs.existsSync(path.join(base, 'src')) ? sources(path.join(base, 'src')) : [];
      for (const name of m.entry ?? []) {
        if (!isExported(src, name)) errors.push(`${pkg.name}: entry "${name}" is not exported from src/`);
      }
      return {
        dir,
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        hasReadme: fs.existsSync(path.join(base, 'README.md')),
        ...m,
        pkg,
      };
    })
    .filter(Boolean);
  return { packages, errors };
}

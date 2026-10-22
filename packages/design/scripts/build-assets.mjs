#!/usr/bin/env node
// Writes dist/css, dist/tokens and dist/catalog.json using the compiled build API (the same code
// path apps run through `buildDesign`), then validates every CSS file with lightningcss and writes
// a minified bundle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'lightningcss';
import { writePackageAssets } from '../dist/build.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const written = writePackageAssets(root);

let failed = false;
// tailwind.css uses Tailwind's @theme at-rule, which lightningcss doesn't know (it has its own test).
for (const rel of written.filter((f) => f.endsWith('.css') && f !== 'css/tailwind.css')) {
  const file = path.join(root, 'dist', rel);
  const result = transform({ filename: rel, code: fs.readFileSync(file), errorRecovery: true });
  for (const w of result.warnings) {
    failed = true;
    console.error(`${rel}:${w.loc.line}:${w.loc.column} ${w.message}`);
  }
}
if (failed) process.exit(1);

const bundle = path.join(root, 'dist', 'css', 'mariachi.css');
const min = transform({ filename: 'mariachi.css', code: fs.readFileSync(bundle), minify: true });
fs.writeFileSync(path.join(root, 'dist', 'css', 'mariachi.min.css'), min.code);
console.log(`@mariachi/design: wrote ${written.length + 1} asset files`);

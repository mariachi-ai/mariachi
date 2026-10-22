import fs from 'node:fs';
import type { Catalog } from '@mariachi/design/build';
import { ExplorerError } from '../lib/errors';
import { fromRoot, once } from '../lib/repo';

const dist = (...parts: string[]) => fromRoot('packages', 'design', 'dist', ...parts);

/** The design library's catalog (components, examples, tokens, presets), from its build output. */
export const loadDesign = once((): Catalog => {
  const file = dist('catalog.json');
  if (!fs.existsSync(file)) throw new ExplorerError('explorer/missing-source', `${file} is missing; build @mariachi/design first`);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog;
});

/** CSS the explorer serves: the library plus every preset theme. */
export const designCss = once(() => {
  const themes = loadDesign().presets.map((p) => fs.readFileSync(dist('css', 'themes', `${p.name}.css`), 'utf8'));
  return { library: fs.readFileSync(dist('css', 'mariachi.css'), 'utf8'), themes: themes.join('\n') };
});

/** Contrast results for every built-in preset (both modes), for the preset pages. */
export const loadPresetChecks = once(async () => {
  const { presets, checkTheme } = await import('@mariachi/design');
  return Object.fromEntries(Object.values(presets).map((p) => [p.name, checkTheme(p)]));
});

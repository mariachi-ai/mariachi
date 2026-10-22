/**
 * Contract-wide checks over every component and preset. A new component or preset is done when
 * this file passes: it's the gate CI applies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASE_FILES, buildCatalog, packageAssets } from '../src/build';
import { componentExamples } from '../src/components/examples';
import { componentList, contract, tokenList } from '../src/contract';
import { unknownDefaultRefs, unknownVars } from '../src/engine/css-vars';
import { checkTheme, formatContrastFailure, presets, type Theme } from '../src/index';

const root = path.resolve(__dirname, '..');
const componentCss = (name: string) => fs.readFileSync(path.join(root, 'src/components', name, `${name}.css`), 'utf8');
const allCss = [
  ...BASE_FILES.map((f) => fs.readFileSync(path.join(root, 'src/css', f), 'utf8')),
  ...componentList.map((c) => componentCss(c.name)),
].join('\n');
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

describe('contract', () => {
  it('has no token that is both a leaf and a group, and unique CSS names', () => {
    const vars = tokenList.map((t) => t.cssVar);
    expect(new Set(vars).size).toBe(vars.length);
  });

  it('defaults reference only known tokens', () => {
    expect(unknownDefaultRefs()).toEqual([]);
  });

  it('every component token has a default', () => {
    const missing = tokenList.filter((t) => t.path.startsWith('components.') && t.def.default === undefined).map((t) => t.path);
    expect(missing).toEqual([]);
  });

  it('packs into assets without errors', () => {
    expect(() => packageAssets(root)).not.toThrow();
  });
});

describe.each(componentList.map((c) => [c.name, c] as const))('component %s', (name, meta) => {
  const css = componentCss(name);

  it('lives in a matching folder with a registry key', () => {
    expect(Object.keys(contract.components)).toContain(camel(name));
  });

  it('references only known tokens', () => {
    expect(unknownVars(css)).toEqual([]);
  });

  it('wraps its CSS in the components layer', () => {
    expect(css.trimStart().startsWith('@layer mariachi.components {')).toBe(true);
  });

  it('uses every token it declares', () => {
    const own = tokenList.filter((t) => t.path.startsWith(`components.${camel(name)}.`));
    const defaults = tokenList.map((t) => JSON.stringify(t.def.default ?? '')).join('\n');
    const unused = own.filter((t) => !allCss.includes(`var(${t.cssVar}`) && !defaults.includes(`var(${t.cssVar})`)).map((t) => t.cssVar);
    expect(unused).toEqual([]);
  });

  it('has examples that use only classes defined in CSS', () => {
    const examples = componentExamples.find((e) => e.component === name);
    expect(examples?.examples.length).toBeGreaterThan(0);
    const html = examples!.examples.map((e) => e.html).join('\n');
    const used = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith('m-')));
    const undefinedClasses = [...used].filter((c) => !new RegExp(`\\.${c}(?![a-z0-9-])`).test(allCss));
    expect(undefinedClasses).toEqual([]);
  });

  it('documents its anatomy and accessibility', () => {
    expect(Object.keys(meta.anatomy).length).toBeGreaterThan(0);
    expect(meta.a11y.length).toBeGreaterThan(0);
    for (const dep of meta.requires ?? []) expect(componentList.map((c) => c.name)).toContain(dep);
  });
});

describe.each(Object.values(presets as Record<string, Theme>).map((p) => [p.name, p] as const))('preset %s', (_name, preset) => {
  const check = checkTheme(preset);

  it('passes every contrast pair in both modes', () => {
    expect(check.failures.map(formatContrastFailure)).toEqual([]);
  });

  it('uses only colours the checker can parse in contrast pairs', () => {
    expect(check.unchecked.map((u) => `${u.pair.fg} / ${u.pair.bg} (${u.mode}): ${u.value}`)).toEqual([]);
  });
});

describe('catalog', () => {
  it('lists every component with tokens and examples', () => {
    const catalog = buildCatalog('0.0.0');
    expect(catalog.components.map((c) => c.name)).toEqual(componentList.map((c) => c.name));
    for (const c of catalog.components) expect(c.examples.length).toBeGreaterThan(0);
  });
});

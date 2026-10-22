import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDesign } from '../src/build';
import {
  DesignError,
  checkTheme,
  contrastRatio,
  defineDesign,
  defineTheme,
  diffTokens,
  emitDtcg,
  emitOverridesCss,
  emitThemeCss,
  extendTheme,
  minimal,
  parseColor,
  resolveToken,
  toHex,
} from '../src/index';
import { expandComponentVars, unknownVars } from '../src/engine/css-vars';

const ratio = (a: string, b: string) => contrastRatio(parseColor(a)!, parseColor(b)!);

describe('color', () => {
  it('matches WCAG reference ratios', () => {
    expect(ratio('#000', '#fff')).toBeCloseTo(21, 2);
    expect(ratio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(ratio('rgb(255 0 0)', 'white')).toBeCloseTo(4, 2);
    expect(ratio('hsl(0 100% 50%)', '#fff')).toBeCloseTo(4, 2);
  });

  it('converts oklch to sRGB', () => {
    expect(toHex(parseColor('oklch(0.628 0.2577 29.23)')!)).toBe('#ff0000');
    expect(toHex(parseColor('oklch(1 0 0)')!)).toBe('#ffffff');
  });

  it('composites translucent colours over the base', () => {
    // 50% black over white is mid grey, which is far from both.
    expect(ratio('oklch(0 0 0 / 0.5)', '#fff')).toBeGreaterThan(3);
    expect(ratio('oklch(0 0 0 / 0.5)', '#fff')).toBeLessThan(5);
  });

  it('returns undefined for values it cannot parse', () => {
    expect(parseColor('color-mix(in oklab, red, blue)')).toBeUndefined();
    expect(parseColor('rebeccapurple')).toBeUndefined();
  });
});

describe('defineTheme', () => {
  it('fills defaults and keeps the given values', () => {
    expect(minimal.tokens['space.unit']).toBe('0.25rem');
    expect(minimal.tokens['radius.md']).toBe('6px');
  });

  it('rejects a theme missing required tokens, naming them', () => {
    const run = () => defineTheme({ name: 'broken', tokens: {} as never });
    expect(run).toThrow(DesignError);
    expect(run).toThrow(/tokens\.color: Required/);
  });

  it('rejects unknown tokens', () => {
    const run = () => extendTheme(minimal, { name: 'x', tokens: { color: { bg: { nope: 'red' } } } as never });
    expect(run).toThrow(/unknown token\(s\) nope/);
  });

  it('rejects bad theme names', () => {
    expect(() => extendTheme(minimal, { name: 'Has Spaces' })).toThrow(DesignError);
  });
});

describe('extendTheme', () => {
  it('changes only what is given', () => {
    const t = extendTheme(minimal, { name: 'acme', tokens: { radius: { md: '12px' } } });
    expect(diffTokens(minimal.tokens, t.tokens)).toEqual({ 'radius.md': '12px' });
    expect(t.extends).toBe('minimal');
  });

  it('keeps the other mode on a partial per-mode override', () => {
    const t = extendTheme(minimal, { name: 'acme', tokens: { color: { accent: { default: { dark: 'oklch(0.5 0.2 30)' } } } } });
    const before = minimal.tokens['color.accent.default'] as { light: string };
    expect(t.tokens['color.accent.default']).toEqual({ light: before.light, dark: 'oklch(0.5 0.2 30)' });
  });
});

describe('resolveToken', () => {
  it('follows references to a concrete value', () => {
    expect(resolveToken(minimal, 'focus.color', 'light')).toBe('oklch(0.55 0.2 262)');
    expect(resolveToken(minimal, 'components.button.primary.bg', 'dark')).toBe('oklch(0.55 0.19 262)');
  });
});

describe('emitThemeCss', () => {
  const css = emitThemeCss(minimal);

  it('scopes to data-theme with zero specificity, in the theme layer', () => {
    expect(css).toContain('@layer mariachi.theme {');
    expect(css).toContain(':where([data-theme="minimal"]) {');
    expect(css).toContain(':where([data-theme="minimal"][data-mode="dark"])');
    expect(css).toContain(':where([data-theme="minimal"]:not([data-mode="light"]))');
  });

  it('repeats only mode-dependent tokens in the dark blocks', () => {
    const dark = css.slice(css.indexOf('[data-mode="dark"]'));
    expect(dark).toContain('--m-color-bg-canvas: oklch(0.17 0.008 250);');
    expect(dark).not.toContain('--m-radius-md');
  });
});

describe('emitDtcg', () => {
  it('emits aliases and per-mode extensions', () => {
    const json = emitDtcg(minimal) as Record<string, any>;
    expect(json.radius.control.$value).toBe('{radius.md}');
    expect(json.color.bg.canvas.$type).toBe('color');
    expect(json.color.bg.canvas.$extensions['mariachi.modes'].dark).toBe('oklch(0.17 0.008 250)');
  });
});

describe('overrides', () => {
  it('emits only the changed token', () => {
    const t = extendTheme(minimal, { name: 'minimal', tokens: { color: { accent: { default: 'oklch(0.5 0.2 30)' } } } });
    const css = emitOverridesCss(minimal, t);
    expect(css).toContain('@layer mariachi.overrides');
    expect(css.match(/--m-[a-z0-9-]+:/g)).toEqual(['--m-color-accent-default:']);
  });

  it('emits nothing when nothing changed', () => {
    expect(emitOverridesCss(minimal, extendTheme(minimal, { name: 'minimal' }))).toBe('');
  });
});

describe('css vars', () => {
  it('adds component defaults as fallbacks, recursively', () => {
    expect(expandComponentVars('a { box-shadow: var(--m-button-hover-shadow); }')).toBe(
      'a { box-shadow: var(--m-button-hover-shadow, var(--m-button-shadow, none)); }',
    );
    expect(expandComponentVars('a { color: var(--m-color-fg-default); }')).toBe('a { color: var(--m-color-fg-default); }');
  });

  it('reports unknown tokens with line numbers', () => {
    expect(unknownVars('a {\n  color: var(--m-colr-fg);\n}')).toEqual([{ name: '--m-colr-fg', line: 2 }]);
  });
});

describe('defineDesign and buildDesign', () => {
  it('adds required components and rejects unknown ones', () => {
    expect(defineDesign({ base: 'minimal', include: ['button'] }).components).toEqual(['button']);
    expect(() => defineDesign({ base: 'minimal', include: ['nope' as never] })).toThrow(/Unknown component/);
    expect(() => defineDesign({ base: 'nope' as never })).toThrow(/Unknown preset/);
  });

  it('builds one file with the base theme plus a diff', async () => {
    const result = await buildDesign({ base: 'minimal', include: ['button'], components: { button: { radius: '999px' } } });
    expect(result.css).toContain('@layer mariachi.reset');
    expect(result.css).toContain('.m-button');
    expect(result.css).toContain(':where([data-theme="minimal"])');
    expect(result.css).toContain('--m-button-radius: 999px;');
    expect(result.check.ok).toBe(true);
  });

  it('emits a full theme under a new name', async () => {
    const result = await buildDesign({ base: 'minimal', name: 'acme', include: ['button'] });
    expect(result.css).toContain(':where([data-theme="acme"])');
    expect(result.css).not.toContain('@layer mariachi.overrides {');
  });

  it('replaces a component with the app file, wrapped in the components layer', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mariachi-design-'));
    fs.writeFileSync(path.join(dir, 'button.css'), '.m-button { color: var(--m-color-accent-text); }');
    const result = await buildDesign({ base: 'minimal', include: ['button'], replace: { button: './button.css' } }, { cwd: dir, outFile: 'out/design.css' });
    expect(result.css).toContain('/* button: replaced by ./button.css */\n@layer mariachi.components {');
    expect(result.css).not.toContain('--_hover-bg');
    expect(fs.readFileSync(path.join(dir, 'out/design.css'), 'utf8')).toBe(result.css);
  });

  it('fails the contrast check on a low-contrast override, naming the pair', async () => {
    const result = await buildDesign({ base: 'minimal', include: ['button'], tokens: { color: { fg: { muted: 'oklch(0.85 0 0)' } } } });
    expect(result.check.ok).toBe(false);
    expect(result.check.failures.map((f) => f.fg)).toContain('color.fg.muted');
  });

  it('checks themes directly', () => {
    expect(checkTheme(minimal).ok).toBe(true);
  });
});

describe('tailwind', () => {
  it('maps semantic tokens onto Tailwind v4 theme variables', async () => {
    const { emitTailwindCss, tailwindName } = await import('../src/index');
    expect(tailwindName('color.bg.surface')).toBe('--color-surface');
    expect(tailwindName('color.fg.default')).toBe('--color-fg');
    expect(tailwindName('color.accent.subtle')).toBe('--color-accent-subtle');
    expect(tailwindName('color.danger.solid')).toBe('--color-danger');
    expect(tailwindName('color.danger.onSolid')).toBe('--color-on-danger');
    expect(tailwindName('font.size.2xl')).toBe('--text-2xl');
    expect(tailwindName('space.unit')).toBe('--spacing');
    expect(tailwindName('z.modal')).toBeUndefined();
    const css = emitTailwindCss();
    expect(css).toContain('@theme inline {');
    expect(css).toContain('  --radius-control: var(--m-radius-control);');
  });
});

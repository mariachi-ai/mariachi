import { tokenList } from '../contract';

const STATUSES = new Set(['success', 'warning', 'danger', 'info']);

/** Tailwind v4 theme variable for a semantic token path, or undefined when it has no Tailwind equivalent. */
export function tailwindName(path: string): string | undefined {
  const [group, a, b] = path.split('.');
  const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  if (group === 'color') {
    if (a === 'bg') return `--color-${b}`;
    if (a === 'fg' || a === 'border' || a === 'accent') return b === 'default' ? `--color-${a}` : `--color-${a}-${kebab(b)}`;
    if (STATUSES.has(a)) return { solid: `--color-${a}`, bg: `--color-${a}-subtle`, fg: `--color-${a}-fg`, border: `--color-${a}-border`, onSolid: `--color-on-${a}` }[b];
    return undefined;
  }
  if (group === 'font') {
    if (a === 'family') return `--font-${b}`;
    if (a === 'size') return `--text-${b}`;
    if (a === 'weight') return `--font-weight-${b}`;
    if (a === 'leading') return `--leading-${b}`;
    if (a === 'tracking') return `--tracking-${b}`;
    return undefined;
  }
  if (group === 'radius' && a !== 'none') return `--radius-${a}`;
  if (group === 'shadow') return `--shadow-${a}`;
  if (group === 'space' && a === 'unit') return '--spacing';
  if (group === 'motion' && a === 'easing') return `--ease-${b}`;
  return undefined;
}

/**
 * A Tailwind v4 stylesheet mapping Tailwind's theme variables onto the `--m-*` tokens, so
 * `bg-surface`, `text-fg-muted`, `rounded-control`, `shadow-md` and spacing utilities follow the
 * active preset. `inline` makes utilities reference the variables, so presets and overrides apply.
 */
export function emitTailwindCss(): string {
  const lines = tokenList
    .filter((t) => !t.path.startsWith('components.'))
    .map((t) => [tailwindName(t.path), t.cssVar] as const)
    .filter((entry): entry is readonly [string, string] => entry[0] !== undefined)
    .map(([name, cssVar]) => `  ${name}: var(${cssVar});`);
  return [
    '/* @mariachi/design for Tailwind v4: @import "tailwindcss"; then this file, plus a preset theme. */',
    '@theme inline {',
    ...lines,
    '}',
    '',
  ].join('\n');
}

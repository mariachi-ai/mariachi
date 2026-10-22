import { tokenByPath, tokenList } from '../contract';
import type { TokenValue } from '../contract/tokens';
import type { Theme } from './theme';
import { valueFor } from './theme';

export interface EmitThemeOptions {
  /** Cascade layer to wrap the declarations in. Default `mariachi.theme`. */
  layer?: string;
  /** Value of `data-theme` the CSS applies to. Default: the theme's name. */
  selector?: string;
}

const order = new Map(tokenList.map((t, i) => [t.path, i]));

function sorted(tokens: Record<string, TokenValue>): [string, TokenValue][] {
  return Object.entries(tokens).sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

function declarations(entries: [string, TokenValue][], mode: 'light' | 'dark', indent: string): string {
  return entries.map(([path, value]) => `${indent}${tokenByPath.get(path)?.cssVar}: ${valueFor(value, mode)};`).join('\n');
}

/**
 * CSS for a set of token values scoped to `[data-theme="<name>"]`. Light values apply by default;
 * dark values apply with `data-mode="dark"` on the same element, or with no `data-mode` (or `auto`)
 * when the OS prefers dark. Only tokens whose value differs between modes are repeated in the dark
 * blocks. Selectors use `:where()`, so they add no specificity.
 */
export function emitTokensCss(tokens: Record<string, TokenValue>, name: string, layer: string): string {
  const all = sorted(tokens);
  const modal = all.filter(([, v]) => typeof v === 'object');
  const scope = `[data-theme="${name}"]`;
  const lines = [`@layer ${layer} {`, `  :where(${scope}) {`, '    color-scheme: light;', declarations(all, 'light', '    '), '  }'];
  if (modal.length > 0) {
    const dark = declarations(modal, 'dark', '      ');
    lines.push(
      '',
      '  @media (prefers-color-scheme: dark) {',
      `    :where(${scope}:not([data-mode="light"])) {`,
      '      color-scheme: dark;',
      dark,
      '    }',
      '  }',
      '',
      `  :where(${scope}[data-mode="dark"]) {`,
      '    color-scheme: dark;',
      declarations(modal, 'dark', '    '),
      '  }',
    );
  }
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export function emitThemeCss(theme: Theme, options: EmitThemeOptions = {}): string {
  const header = `/* @mariachi/design theme "${theme.name}"${theme.extends ? ` (extends "${theme.extends}")` : ''} */\n`;
  return header + emitTokensCss(theme.tokens, options.selector ?? theme.name, options.layer ?? 'mariachi.theme');
}

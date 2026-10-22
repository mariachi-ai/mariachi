import { tokenByPath, tokenByVar } from '../contract';
import type { TokenKind, TokenValue } from '../contract/tokens';
import type { Theme } from './theme';
import { valueFor } from './theme';

const DTCG_TYPE: Record<TokenKind, string> = {
  color: 'color',
  length: 'dimension',
  shadow: 'shadow',
  'font-family': 'fontFamily',
  'font-weight': 'fontWeight',
  number: 'number',
  duration: 'duration',
  easing: 'cubicBezier',
  keyword: 'string',
  'z-index': 'number',
};

/** `var(--m-color-bg-surface)` → `{color.bg.surface}` (a DTCG alias); other values unchanged. */
function toDtcgValue(value: string): string {
  const match = /^var\((--m-[a-z0-9-]+)\)$/.exec(value.trim());
  const token = match ? tokenByVar.get(match[1]) : undefined;
  return token ? `{${token.path}}` : value;
}

/**
 * W3C Design Tokens (DTCG) JSON for a theme, for Figma (Tokens Studio) and other tools. `$value`
 * is the light value; tokens that differ by mode carry both under `$extensions["mariachi.modes"]`.
 */
export function emitDtcg(theme: Theme): Record<string, unknown> {
  const root: Record<string, unknown> = {
    $description: `@mariachi/design theme "${theme.name}"${theme.description ? `: ${theme.description}` : ''}`,
  };
  for (const [path, value] of Object.entries(theme.tokens) as [string, TokenValue][]) {
    const token = tokenByPath.get(path);
    if (!token) continue;
    let node = root;
    const parts = path.split('.');
    for (const part of parts.slice(0, -1)) {
      node[part] ??= {};
      node = node[part] as Record<string, unknown>;
    }
    const leaf: Record<string, unknown> = {
      $type: DTCG_TYPE[token.def.kind],
      $value: toDtcgValue(valueFor(value, 'light')),
      $description: token.def.description,
    };
    if (typeof value === 'object') {
      leaf.$extensions = { 'mariachi.modes': { light: toDtcgValue(value.light), dark: toDtcgValue(value.dark) } };
    }
    node[parts[parts.length - 1]] = leaf;
  }
  return root;
}

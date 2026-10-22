import type { Theme } from './theme';
import { diffTokens } from './diff';
import { emitTokensCss } from './emit-css';

/**
 * CSS holding only the tokens `theme` changes relative to `base`, in the `mariachi.overrides`
 * layer and scoped to the base's `data-theme`. Empty when nothing changed.
 */
export function emitOverridesCss(base: Theme, theme: Theme): string {
  const changed = diffTokens(base.tokens, theme.tokens);
  if (Object.keys(changed).length === 0) return '';
  return `/* Overrides on "${base.name}": ${Object.keys(changed).length} token(s) */\n${emitTokensCss(changed, base.name, 'mariachi.overrides')}`;
}

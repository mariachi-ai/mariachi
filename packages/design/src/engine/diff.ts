import type { TokenValue } from '../contract/tokens';

const same = (a: TokenValue | undefined, b: TokenValue) =>
  a !== undefined && (typeof a === 'string' || typeof b === 'string' ? a === b : a.light === b.light && a.dark === b.dark);

/** Tokens in `next` whose value differs from `base`: what an override needs to emit. */
export function diffTokens(base: Record<string, TokenValue>, next: Record<string, TokenValue>): Record<string, TokenValue> {
  const out: Record<string, TokenValue> = {};
  for (const [path, value] of Object.entries(next)) if (!same(base[path], value)) out[path] = value;
  return out;
}

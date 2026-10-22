import { tokenByVar, tokenList } from '../contract';
import { valueFor } from './theme';

const VAR_NAME = /--m-[a-z0-9-]+/g;
/** `var(--m-x)` with no fallback. */
const BARE_VAR = /var\(\s*(--m-[a-z0-9-]+)\s*\)/g;

/** Every `--m-*` name referenced (inside `var()`) in a CSS string, with its line number. */
export function referencedVars(css: string): { name: string; line: number }[] {
  const out: { name: string; line: number }[] = [];
  css.split('\n').forEach((text, i) => {
    for (const m of text.matchAll(/var\(\s*(--m-[a-z0-9-]+)/g)) out.push({ name: m[1], line: i + 1 });
  });
  return out;
}

/** Names referenced in `css` that the contract doesn't define. */
export function unknownVars(css: string): { name: string; line: number }[] {
  return referencedVars(css).filter((v) => !tokenByVar.has(v.name));
}

/** Contract defaults that reference an unknown `--m-*` token. */
export function unknownDefaultRefs(): { path: string; name: string }[] {
  const out: { path: string; name: string }[] = [];
  for (const token of tokenList) {
    if (token.def.default === undefined) continue;
    for (const mode of ['light', 'dark'] as const) {
      for (const name of valueFor(token.def.default, mode).match(VAR_NAME) ?? []) {
        if (!tokenByVar.has(name) && !out.some((o) => o.path === token.path && o.name === name)) out.push({ path: token.path, name });
      }
    }
  }
  return out;
}

function expandValue(value: string, depth: number): string {
  if (depth > 8) return value;
  return value.replace(BARE_VAR, (whole, name: string) => {
    const token = tokenByVar.get(name);
    if (!token?.path.startsWith('components.') || token.def.default === undefined) return whole;
    // Component tokens have mode-independent defaults (they reference semantic tokens).
    const fallback = expandValue(valueFor(token.def.default, 'light'), depth + 1);
    return `var(${name}, ${fallback})`;
  });
}

/**
 * Adds each component token's contract default as the `var()` fallback, so component CSS can be
 * written as `var(--m-button-radius)` while defaults live in one place. The fallback resolves on
 * the component's own element, so an app override at any scope (`.marketing { --m-color-accent-default: … }`)
 * reaches the component.
 */
export function expandComponentVars(css: string): string {
  return expandValue(css, 0);
}

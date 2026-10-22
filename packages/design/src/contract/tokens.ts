/**
 * Token definitions. The contract is a nested object whose leaves are `TokenDef`s; everything else
 * (Zod schemas, TypeScript input types, CSS variable names, the explorer's token pages) is derived
 * from it, so a token exists in exactly one place.
 */

export type TokenKind =
  | 'color'
  | 'length'
  | 'shadow'
  | 'font-family'
  | 'font-weight'
  | 'number'
  | 'duration'
  | 'easing'
  | 'keyword'
  | 'z-index';

/** A token value: one CSS value for both modes, or a value per mode. */
export type TokenValue = string | { light: string; dark: string };

export interface TokenDef<K extends TokenKind = TokenKind, D extends boolean = boolean> {
  readonly __token: true;
  readonly kind: K;
  readonly description: string;
  readonly hasDefault: D;
  /** CSS value, may reference other tokens with `var(--m-…)` (see `ref`). */
  readonly default?: TokenValue;
}

function def<K extends TokenKind>(kind: K) {
  function make(description: string): TokenDef<K, false>;
  function make(description: string, defaultValue: TokenValue): TokenDef<K, true>;
  function make(description: string, defaultValue?: TokenValue): TokenDef<K, boolean> {
    return { __token: true, kind, description, hasDefault: defaultValue !== undefined, default: defaultValue };
  }
  return make;
}

export const t = {
  color: def('color'),
  length: def('length'),
  shadow: def('shadow'),
  fontFamily: def('font-family'),
  fontWeight: def('font-weight'),
  number: def('number'),
  duration: def('duration'),
  easing: def('easing'),
  keyword: def('keyword'),
  zIndex: def('z-index'),
};

export function isTokenDef(value: unknown): value is TokenDef {
  return typeof value === 'object' && value !== null && (value as TokenDef).__token === true;
}

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * CSS custom property for a token path. Semantic tokens map directly (`color.bg.surface` →
 * `--m-color-bg-surface`); component tokens drop the `components.` prefix (`components.button.radius`
 * → `--m-button-radius`).
 */
export function cssVar(path: string): string {
  const parts = path.split('.');
  const rest = parts[0] === 'components' ? parts.slice(1) : parts;
  return `--m-${rest.map(kebab).join('-')}`;
}

/** `var(--m-…)` for a token path, for use in defaults and preset values. */
export function ref(path: string): string {
  return `var(${cssVar(path)})`;
}

export interface FlatToken {
  path: string;
  cssVar: string;
  def: TokenDef;
}

/** Walks a contract object and returns every leaf with its dotted path. */
export function flattenContract(tree: object, prefix = ''): FlatToken[] {
  const out: FlatToken[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isTokenDef(value)) out.push({ path, cssVar: cssVar(path), def: value });
    else if (typeof value === 'object' && value !== null) out.push(...flattenContract(value, path));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Types derived from a contract object.

type IsRequiredLeaf<T> = T extends TokenDef<TokenKind, false> ? true : false;
type HasRequired<T> = T extends TokenDef
  ? IsRequiredLeaf<T>
  : true extends { [K in keyof T]: HasRequired<T[K]> }[keyof T]
    ? true
    : false;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Values a full theme must provide: tokens without a default are required. */
export type TokenInput<T> = Simplify<
  { [K in keyof T as HasRequired<T[K]> extends true ? K : never]: T[K] extends TokenDef ? TokenValue : TokenInput<T[K]> } & {
    [K in keyof T as HasRequired<T[K]> extends true ? never : K]?: T[K] extends TokenDef ? TokenValue : TokenOverrides<T[K]>;
  }
>;

/** Any subset of a contract's values: what an override or `extendTheme` accepts. */
export type TokenOverrides<T> = { [K in keyof T]?: T[K] extends TokenDef ? TokenValue : TokenOverrides<T[K]> };

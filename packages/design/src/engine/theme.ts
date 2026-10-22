import { z } from 'zod';
import { contract, type ComponentContract, tokenByPath, tokenByVar, tokenList } from '../contract';
import type { SemanticContract } from '../contract/semantic';
import { isTokenDef, type TokenInput, type TokenOverrides, type TokenValue } from '../contract/tokens';
import { DesignError } from '../errors';

export type Mode = 'light' | 'dark';

/** A partial per-mode value is allowed in overrides: `{ dark: '…' }` changes dark mode only. */
export type TokenOverrideValue = TokenValue | { light?: string; dark?: string };

type Overridable<T> = { [K in keyof T]?: T[K] extends TokenValue ? TokenOverrideValue : Overridable<T[K]> };

export type SemanticInput = TokenInput<SemanticContract>;
export type SemanticOverrides = Overridable<TokenOverrides<SemanticContract>>;
export type ComponentOverrides = Overridable<TokenOverrides<ComponentContract>>;

export interface ThemeDefinition {
  /** Lowercase identifier used as `data-theme="<name>"`. */
  name: string;
  label?: string;
  description?: string;
  tokens: SemanticInput;
  components?: ComponentOverrides;
}

export interface ThemeExtension {
  name: string;
  label?: string;
  description?: string;
  tokens?: SemanticOverrides;
  components?: ComponentOverrides;
}

export interface Theme {
  name: string;
  label: string;
  description: string;
  /** The theme this one was extended from, if any. */
  extends?: string;
  /** Every semantic token (defaults filled in) plus the component tokens this theme sets, by path. */
  tokens: Record<string, TokenValue>;
}

// ---------------------------------------------------------------------------------------------
// Schemas derived from the contract.

const cssValue = z.string().trim().min(1);
const fullValue = z.union([cssValue, z.object({ light: cssValue, dark: cssValue }).strict()]);
const partialValue = z.union([
  cssValue,
  z
    .object({ light: cssValue.optional(), dark: cssValue.optional() })
    .strict()
    .refine((v) => v.light !== undefined || v.dark !== undefined, 'Give light, dark, or both'),
]);

function hasRequired(tree: object): boolean {
  return Object.values(tree).some((v) => (isTokenDef(v) ? !v.hasDefault : typeof v === 'object' && hasRequired(v)));
}

function schemaFor(tree: object, mode: 'full' | 'partial'): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (isTokenDef(value)) {
      shape[key] = mode === 'full' && !value.hasDefault ? fullValue : (mode === 'full' ? fullValue : partialValue).optional();
    } else {
      const child = schemaFor(value, mode);
      shape[key] = mode === 'full' && hasRequired(value) ? child : child.optional();
    }
  }
  return z.object(shape).strict();
}

const { components: componentTree, ...semanticTree } = contract;
export const semanticSchema = schemaFor(semanticTree, 'full');
export const semanticOverridesSchema = schemaFor(semanticTree, 'partial');
export const componentOverridesSchema = schemaFor(componentTree, 'partial');
const themeName = z.string().regex(/^[a-z][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes');

export function formatIssues(error: z.ZodError, prefix: string): string {
  return error.issues
    .map((i) => {
      const path = [prefix, ...i.path].filter((p) => p !== '').join('.');
      if (i.code === 'unrecognized_keys') return `${path}: unknown token(s) ${i.keys.join(', ')}`;
      return `${path}: ${i.message}`;
    })
    .join('\n');
}

function parse<T>(schema: z.ZodTypeAny, value: unknown, prefix: string, code: string, subject: string): T {
  const result = schema.safeParse(value ?? {});
  if (!result.success) throw new DesignError(code, `Invalid ${subject}:\n${formatIssues(result.error, prefix)}`);
  return result.data as T;
}

// ---------------------------------------------------------------------------------------------
// Flattening and merging.

/** Nested token values → `{ 'color.bg.canvas': value }`, guided by the contract shape. */
export function flattenValues(input: object, tree: object = contract, prefix = ''): Record<string, TokenOverrideValue> {
  const out: Record<string, TokenOverrideValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const node = (tree as Record<string, unknown>)[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (isTokenDef(node)) out[path] = value as TokenOverrideValue;
    else if (node && typeof node === 'object') Object.assign(out, flattenValues(value as object, node, path));
  }
  return out;
}

/** Normalises `{ light: x, dark: x }` to `x`. */
function normalize(value: TokenValue): TokenValue {
  return typeof value === 'object' && value.light === value.dark ? value.light : value;
}

export function valueFor(value: TokenValue, mode: Mode): string {
  return typeof value === 'string' ? value : value[mode];
}

/** Applies an override on top of a base value; a partial per-mode override keeps the other mode. */
export function mergeValue(base: TokenValue | undefined, override: TokenOverrideValue): TokenValue {
  if (typeof override === 'string') return override;
  const fallback = base ?? override.light ?? override.dark ?? '';
  return normalize({ light: override.light ?? valueFor(fallback, 'light'), dark: override.dark ?? valueFor(fallback, 'dark') });
}

export function applyOverrides(tokens: Record<string, TokenValue>, overrides: Record<string, TokenOverrideValue>): Record<string, TokenValue> {
  const out = { ...tokens };
  for (const [path, value] of Object.entries(overrides)) out[path] = mergeValue(out[path] ?? tokenByPath.get(path)?.def.default, value);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Public API.

/** Defines a complete theme. Every semantic token without a default must be given. */
export function defineTheme(definition: ThemeDefinition): Theme {
  const name = parse<string>(themeName, definition.name, 'name', 'design/invalid-theme', 'theme name');
  const subject = `theme "${name}"`;
  const tokens = parse<object>(semanticSchema, definition.tokens, 'tokens', 'design/invalid-theme', subject);
  const components = parse<object>(componentOverridesSchema, definition.components, 'components', 'design/invalid-theme', subject);

  const flat: Record<string, TokenValue> = {};
  for (const token of tokenList) {
    if (!token.path.startsWith('components.') && token.def.default !== undefined) flat[token.path] = token.def.default;
  }
  const values = applyOverrides(flat, flattenValues(tokens));
  const withComponents = applyOverrides(values, flattenValues({ components }));
  return {
    name,
    label: definition.label ?? name[0].toUpperCase() + name.slice(1),
    description: definition.description ?? '',
    tokens: withComponents,
  };
}

/** Builds a new theme from an existing one, changing only what's given. */
export function extendTheme(base: Theme, extension: ThemeExtension): Theme {
  const name = parse<string>(themeName, extension.name, 'name', 'design/invalid-theme', 'theme name');
  const subject = `theme "${name}"`;
  const tokens = parse<object>(semanticOverridesSchema, extension.tokens, 'tokens', 'design/invalid-theme', subject);
  const components = parse<object>(componentOverridesSchema, extension.components, 'components', 'design/invalid-theme', subject);
  return {
    name,
    label: extension.label ?? name[0].toUpperCase() + name.slice(1),
    description: extension.description ?? base.description,
    extends: base.name,
    tokens: applyOverrides(applyOverrides(base.tokens, flattenValues(tokens)), flattenValues({ components })),
  };
}

/**
 * The value a token has in a theme and mode, following `var(--m-…)` references (and their
 * fallbacks) until a value without a reference is reached. Component tokens the theme doesn't set
 * resolve through their contract default, as they do in the browser.
 */
export function resolveToken(theme: Theme, path: string, mode: Mode, seen: Set<string> = new Set()): string | undefined {
  if (seen.has(path)) return undefined;
  seen.add(path);
  const raw = theme.tokens[path] ?? tokenByPath.get(path)?.def.default;
  if (raw === undefined) return undefined;
  return resolveValue(theme, valueFor(raw, mode), mode, seen);
}

/** Resolves a CSS value that is a single `var(--m-x[, fallback])`; other values are returned as-is. */
export function resolveValue(theme: Theme, value: string, mode: Mode, seen: Set<string> = new Set()): string | undefined {
  const match = /^var\(\s*(--m-[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/.exec(value.trim());
  if (!match) return value;
  const token = tokenByVar.get(match[1]);
  const resolved = token ? resolveToken(theme, token.path, mode, new Set(seen)) : undefined;
  if (resolved !== undefined) return resolved;
  return match[2] !== undefined ? resolveValue(theme, match[2], mode, seen) : undefined;
}

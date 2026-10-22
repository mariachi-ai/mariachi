/**
 * @mariachi/design, browser-safe entry: the token contract, presets, and the functions that define
 * and extend themes and validate design configs. CSS ships separately (`@mariachi/design/mariachi.css`,
 * `@mariachi/design/themes/<preset>.css`); the Node build API is `@mariachi/design/build`.
 */
export { contract, componentList, contrastPairs, semantic, semanticContrastPairs, tokenByPath, tokenByVar, tokenList } from './contract';
export type { ComponentContract, Contract, ContrastPair } from './contract';
export { defineComponent, defineExamples } from './contract/component';
export type { ComponentCategory, ComponentExample, ComponentExamples, ComponentMeta } from './contract/component';
export { cssVar, flattenContract, isTokenDef, ref, t } from './contract/tokens';
export type { FlatToken, TokenDef, TokenInput, TokenKind, TokenOverrides, TokenValue } from './contract/tokens';
export {
  applyOverrides,
  defineTheme,
  extendTheme,
  flattenValues,
  mergeValue,
  resolveToken,
  resolveValue,
  valueFor,
} from './engine/theme';
export type {
  ComponentOverrides,
  Mode,
  SemanticInput,
  SemanticOverrides,
  Theme,
  ThemeDefinition,
  ThemeExtension,
  TokenOverrideValue,
} from './engine/theme';
export { checkTheme, formatContrastFailure } from './engine/check';
export type { ContrastResult, ThemeCheck } from './engine/check';
export { composite, contrastRatio, luminance, parseColor, toHex } from './engine/color';
export type { LinearRgba } from './engine/color';
export { emitThemeCss, emitTokensCss } from './engine/emit-css';
export type { EmitThemeOptions } from './engine/emit-css';
export { emitDtcg } from './engine/emit-dtcg';
export { diffTokens } from './engine/diff';
export { emitOverridesCss } from './engine/overrides';
export { emitTailwindCss, tailwindName } from './engine/tailwind';
export { defineDesign, resolvePreset } from './design';
export type { ComponentName, DesignConfig, ResolvedDesign } from './design';
export { brutalist, editorial, enterprise, minimal, presets, soft, terminal } from './presets';
export type { PresetName } from './presets';
export { DesignError } from './errors';

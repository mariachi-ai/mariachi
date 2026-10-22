import type { ContrastPair } from './contrast-pairs';
import type { TokenDef } from './tokens';

export type ComponentCategory =
  | 'actions'
  | 'forms'
  | 'layout'
  | 'navigation'
  | 'feedback'
  | 'overlays'
  | 'data'
  | 'content'
  | 'ai';

export interface TokenTree {
  [key: string]: TokenDef | TokenTree;
}

export interface ComponentMeta<T extends TokenTree = TokenTree, N extends string = string> {
  /** Folder name and CSS class: `button` → `.m-button`, `components/button.css`. */
  name: N;
  title: string;
  category: ComponentCategory;
  description: string;
  useWhen: string;
  /** Classes and data attributes the markup contract defines, for docs and coding agents. */
  anatomy: Record<string, string>;
  /** Component tokens. Every token needs a default (usually a `ref()` to a semantic token). */
  tokens: T;
  /** Other components whose CSS this one needs (included transitively by `buildDesign`). */
  requires?: string[];
  /** Extra contrast pairs, paths relative to the component (`primary.fg` → `components.button.primary.fg`). */
  contrast?: ContrastPair[];
  a11y: string[];
}

export function defineComponent<T extends TokenTree, const N extends string>(meta: ComponentMeta<T, N>): ComponentMeta<T, N> {
  return meta;
}

export interface ComponentExample {
  name: string;
  description?: string;
  html: string;
}

export interface ComponentExamples {
  component: string;
  examples: ComponentExample[];
}

export function defineExamples(component: string, examples: ComponentExample[]): ComponentExamples {
  return { component, examples };
}

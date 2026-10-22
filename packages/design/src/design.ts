import { componentList } from './contract';
import {
  type ComponentOverrides,
  componentOverridesSchema,
  extendTheme,
  formatIssues,
  type SemanticOverrides,
  semanticOverridesSchema,
  type Theme,
} from './engine/theme';
import { DesignError } from './errors';
import { type PresetName, presets } from './presets';

export type ComponentName = (typeof componentList)[number]['name'];

/** What `mariachi.design.ts` exports. Every field except `base` is optional. */
export interface DesignConfig {
  /** A built-in preset name or a theme from `defineTheme` / `extendTheme`. */
  base: PresetName | Theme;
  /**
   * Emit the result as a new theme under this name (`data-theme="<name>"`). Without it, the output
   * keeps the base's name and only the changed tokens are emitted on top of it.
   */
  name?: string;
  /** Components to ship. Default: all. Dependencies are added automatically. */
  include?: ComponentName[];
  tokens?: SemanticOverrides;
  components?: ComponentOverrides;
  /** Replace one component's CSS with your own file (path relative to the config file). */
  replace?: Partial<Record<ComponentName, string>>;
}

export interface ResolvedDesign {
  config: DesignConfig;
  base: Theme;
  /** The base with every override applied. */
  theme: Theme;
  /** Component names to ship, dependencies included, in contract order. */
  components: ComponentName[];
}

const componentNames = new Set<string>(componentList.map((c) => c.name));

export function resolvePreset(base: PresetName | Theme): Theme {
  if (typeof base !== 'string') return base;
  const preset = (presets as Record<string, Theme>)[base];
  if (!preset) {
    throw new DesignError('design/unknown-preset', `Unknown preset "${base}". Presets: ${Object.keys(presets).join(', ')}`);
  }
  return preset;
}

function withDependencies(names: string[]): ComponentName[] {
  const wanted = new Set<string>();
  const visit = (name: string) => {
    if (wanted.has(name)) return;
    wanted.add(name);
    for (const dep of componentList.find((c) => c.name === name)?.requires ?? []) visit(dep);
  };
  names.forEach(visit);
  return componentList.filter((c) => wanted.has(c.name)).map((c) => c.name);
}

/**
 * Validates a design config and resolves it to a theme. Unknown tokens, components and presets
 * throw a `DesignError` naming the offending path.
 */
export function defineDesign(config: DesignConfig): ResolvedDesign {
  const base = resolvePreset(config.base);
  const unknown = [...(config.include ?? []), ...Object.keys(config.replace ?? {})].filter((n) => !componentNames.has(n));
  if (unknown.length > 0) {
    throw new DesignError('design/unknown-component', `Unknown component(s): ${unknown.join(', ')}`, { unknown });
  }
  for (const [schema, value, prefix] of [
    [semanticOverridesSchema, config.tokens, 'tokens'],
    [componentOverridesSchema, config.components, 'components'],
  ] as const) {
    const result = schema.safeParse(value ?? {});
    if (!result.success) throw new DesignError('design/invalid-config', `Invalid design config:\n${formatIssues(result.error, prefix)}`);
  }
  const theme = extendTheme(base, {
    name: config.name ?? base.name,
    label: config.name ? undefined : base.label,
    tokens: config.tokens,
    components: config.components,
  });
  return {
    config,
    base,
    theme: config.name ? theme : { ...theme, extends: base.extends },
    components: withDependencies(config.include ?? [...componentNames]),
  };
}

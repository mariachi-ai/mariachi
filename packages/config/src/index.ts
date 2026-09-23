import { ConfigError, fromZodError, isZodError, loadOptionalPeer } from '@mariachi/core';
import type { z } from 'zod';
import { AppConfigSchema, type AppConfig, type AppConfigInput } from './schema';
import { buildConfigFromEnv, readEnv } from './env';
import type { ConfigOptions, SecretsAdapter, FeatureFlagAdapter } from './types';
import { EnvSecretsAdapter } from './adapters/env';
import { Secrets } from './secrets';

export interface LoadConfigOptions {
  /** Load a `.env` file first. `true` = `.env` in cwd, string = explicit path. Default: true outside production. */
  dotenv?: boolean | string;
  /** Use this instead of `process.env` (tests). */
  env?: Record<string, string | undefined>;
}

interface ConfigSection<T = unknown> {
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  fromEnv?: (read: (key: string) => string | undefined) => unknown;
}

const sections = new Map<string, ConfigSection>();
let cachedConfig: AppConfig | null = null;

/**
 * Lets a package contribute a validated config section. Call at module scope (before `loadConfig()`).
 * Read it back with `useConfigSection(name)`.
 */
export function registerConfigSection<T>(name: string, section: ConfigSection<T>): void {
  sections.set(name, section as ConfigSection);
  cachedConfig = null;
}

function loadDotenv(option: boolean | string | undefined, isProduction: boolean): void {
  const enabled = option ?? !isProduction;
  if (!enabled) return;
  // dotenv is loaded lazily so importing @mariachi/config never mutates process.env.
  const dotenv = loadOptionalPeer<typeof import('dotenv')>('dotenv', 'loadConfig({ dotenv })', import.meta.url);
  dotenv.config(typeof option === 'string' ? { path: option } : undefined);
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, what: string): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (isZodError(error)) {
      const v = fromZodError(error);
      const summary = v.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      throw new ConfigError('config/invalid', `Invalid ${what}: ${summary}`, { issues: v.issues });
    }
    throw error;
  }
}

/**
 * Loads config from env (+ optional .env) merged with `overrides`, validates it, and caches it
 * so later `useConfig()` calls return the same object.
 */
export function loadConfig(overrides?: AppConfigInput, options: LoadConfigOptions = {}): AppConfig {
  const source = options.env ?? process.env;
  if (!options.env) loadDotenv(options.dotenv, (source.NODE_ENV ?? source.ENV) === 'production');

  const fromEnv = buildConfigFromEnv(source);
  const merged = deepMerge(fromEnv as Record<string, unknown>, (overrides ?? {}) as Record<string, unknown>);
  const config = parse(AppConfigSchema, merged, 'configuration');

  const read = options.env ? (k: string) => options.env?.[k] : readEnv;
  for (const [name, section] of sections) {
    const raw = deepMerge(
      (section.fromEnv?.(read) ?? {}) as Record<string, unknown>,
      ((config.sections[name] as Record<string, unknown>) ?? {}),
    );
    config.sections[name] = parse(section.schema, raw, `config section "${name}"`);
  }

  cachedConfig = config;
  return config;
}

export function useConfig(): AppConfig {
  if (!cachedConfig) cachedConfig = loadConfig();
  return cachedConfig;
}

export function useConfigSection<T>(name: string): T {
  const config = useConfig();
  if (!(name in config.sections)) {
    throw new ConfigError('config/unknown-section', `Config section "${name}" is not registered`);
  }
  return config.sections[name] as T;
}

/** Clears the cached config (tests). */
export function resetConfig(): void {
  cachedConfig = null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(value) && isPlainObject(result[key]) ? deepMerge(result[key] as Record<string, unknown>, value) : value;
  }
  return result;
}

export function createSecrets(config: ConfigOptions['secrets'] = { adapter: 'env' }): Secrets {
  if (config.adapter === 'env') return new Secrets(new EnvSecretsAdapter());
  throw new ConfigError('config/unsupported-secrets-adapter', `Unsupported secrets adapter: ${config.adapter}`);
}

export { createFeatureFlags, type FeatureFlagsConfig } from './flags/index';
export { evaluateFlag } from './flags/adapters';
export type { AppConfig, AppConfigInput, ConfigOptions, SecretsAdapter, FeatureFlagAdapter };
export type { FlagContext, FeatureFlagRecord, FeatureFlagStore, TenantFlagOverride } from './types';
export { AppConfigSchema };
export { buildConfigFromEnv, readEnv };
export { EnvSecretsAdapter } from './adapters/env';
export { Secrets } from './secrets';
export { CachedFeatureFlags, StoreFeatureFlagAdapter, StaticFeatureFlagAdapter } from './flags/adapters';
export * from './schema/index';

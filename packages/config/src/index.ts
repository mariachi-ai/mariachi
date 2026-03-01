import { config } from 'dotenv';
import { AppConfigSchema, type AppConfig } from './schema';
import type { ConfigOptions, SecretsAdapter, FeatureFlagAdapter } from './types';
import { EnvSecretsAdapter } from './adapters/env';
import { createFeatureFlags as createFeatureFlagsFactory } from './flags/index';

config();

let cachedConfig: AppConfig | null = null;

function buildConfigFromEnv(): Partial<AppConfig> {
  const env = process.env.ENV ?? process.env.NODE_ENV;
  const databaseUrl = process.env.DATABASE_URL;
  const databaseAdapter = process.env.DATABASE_ADAPTER;
  const databasePoolMin = process.env.DATABASE_POOL_MIN;
  const databasePoolMax = process.env.DATABASE_POOL_MAX;
  const redisUrl = process.env.REDIS_URL;
  const jwtSecret = process.env.JWT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;

  const base: Partial<AppConfig> = {
    env:
      env === 'development' || env === 'test' || env === 'production'
        ? env
        : undefined,
    database: databaseUrl
      ? {
          url: databaseUrl,
          adapter: databaseAdapter ?? 'postgres',
          poolMin: databasePoolMin ? Number(databasePoolMin) : 2,
          poolMax: databasePoolMax ? Number(databasePoolMax) : 10,
        }
      : undefined,
    redis: redisUrl ? { url: redisUrl } : undefined,
    auth:
      jwtSecret || sessionSecret
        ? {
            adapter: 'jwt',
            jwtSecret: jwtSecret ?? undefined,
            sessionSecret: sessionSecret ?? undefined,
          }
        : undefined,
  };

  return base;
}

export function loadConfig(overrides?: Partial<AppConfig>): AppConfig {
  const fromEnv = buildConfigFromEnv();
  const merged = deepMerge(fromEnv, overrides ?? {}) as Partial<AppConfig>;
  return AppConfigSchema.parse(merged) as AppConfig;
}

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key];
    if (
      sourceVal !== undefined &&
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof (sourceVal as object).constructor === 'function' &&
      (sourceVal as object).constructor === Object
    ) {
      const targetVal = result[key];
      (result as Record<string, unknown>)[key as string] = deepMerge(
        (typeof targetVal === 'object' && targetVal !== null
          ? targetVal
          : {}) as object,
        sourceVal as object
      );
    } else if (sourceVal !== undefined) {
      (result as Record<string, unknown>)[key as string] = sourceVal;
    }
  }
  return result;
}

export function createSecrets(config: ConfigOptions['secrets']): SecretsAdapter {
  if (config.adapter === 'env') {
    return new EnvSecretsAdapter();
  }
  throw new Error(`Unsupported secrets adapter: ${config.adapter}`);
}

export function createFeatureFlags(
  config: NonNullable<ConfigOptions['flags']>
): FeatureFlagAdapter {
  return createFeatureFlagsFactory(config);
}

export function useConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export type { AppConfig, ConfigOptions, SecretsAdapter, FeatureFlagAdapter };
export { AppConfigSchema };
export { EnvSecretsAdapter } from './adapters/env';
export * from './schema/index';

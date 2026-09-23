import { ConfigError } from '@mariachi/core';
import type { FeatureFlagAdapter, FeatureFlagRecord, FeatureFlagStore } from '../types';
import { CachedFeatureFlags, StaticFeatureFlagAdapter, StoreFeatureFlagAdapter } from './adapters';

export type FeatureFlagsConfig =
  | { adapter: 'store'; store: FeatureFlagStore; cacheTtlMs?: number }
  | { adapter: 'static'; flags: Record<string, FeatureFlagRecord | boolean> };

export function createFeatureFlags(config: FeatureFlagsConfig): FeatureFlagAdapter {
  switch (config.adapter) {
    case 'store':
      return new StoreFeatureFlagAdapter(
        config.cacheTtlMs === 0 ? config.store : new CachedFeatureFlags(config.store, config.cacheTtlMs),
      );
    case 'static':
      return new StaticFeatureFlagAdapter(config.flags);
    default:
      throw new ConfigError(
        'config/unsupported-flags-adapter',
        `Unsupported feature flags adapter: ${(config as { adapter: string }).adapter}`,
      );
  }
}

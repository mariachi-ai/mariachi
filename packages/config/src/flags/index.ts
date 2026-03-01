import { ConfigError } from '@mariachi/core';
import type { FeatureFlagAdapter } from '../types';
import type { ConfigOptions } from '../types';

export function createFeatureFlags(
  config: NonNullable<ConfigOptions['flags']>
): FeatureFlagAdapter {
  throw new ConfigError('config/unsupported-flags-adapter', `Unsupported feature flags adapter: ${config.adapter}. A real adapter (e.g. database-backed) is required.`);
}

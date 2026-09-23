import { defineConfig, mergeConfig } from 'vitest/config';
import { sharedIntegration as shared } from '../../vitest.shared';

export default mergeConfig(shared, defineConfig({
  test: {
    name: 'cli-integration',
  },
}));

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['registry.ts', 'slack/index.ts', 'slack/test.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});

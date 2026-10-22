import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/program.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  shims: true,
  banner: { js: '#!/usr/bin/env node' },
});

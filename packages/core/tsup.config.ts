import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', errors: 'src/errors.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  shims: true,
  splitting: false,
});

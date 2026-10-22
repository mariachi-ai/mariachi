import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts', build: 'src/build.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    shims: true,
    splitting: false,
    external: ['lightningcss'],
  },
  {
    // Browser-only progressive enhancement; ESM, no Node shims.
    entry: { behaviors: 'src/behaviors/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    platform: 'browser',
    splitting: false,
  },
]);

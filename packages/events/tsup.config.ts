import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', outbox: 'src/outbox/index.ts' },
  external: ['@mariachi/database', '@mariachi/database-postgres', 'drizzle-orm'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  shims: true,
  splitting: false,
});

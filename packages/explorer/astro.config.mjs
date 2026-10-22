// @ts-check
import { defineConfig } from 'astro/config';

// EXPLORER_BASE / EXPLORER_SITE are set by the GitHub Pages deploy (served under /<repo>/).
// The published package and `mariachi explore` use the default base, '/'.
const base = process.env.EXPLORER_BASE ?? '/';

export default defineConfig({
  outDir: './dist/site',
  base,
  site: process.env.EXPLORER_SITE,
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  vite: {
    // Loaders read the repo at build time; keep Node-only packages out of the client bundle.
    ssr: { external: ['typescript', 'shiki'] },
  },
});

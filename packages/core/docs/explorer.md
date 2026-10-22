# Explorer

`@mariachi/explorer` is one site for the whole framework: every package, the docs, the API surface,
error codes, the dependency graph, CLI commands, framework tables and the [design library](./design.md),
with search. It's generated from the repo at build time, so it can't drift from the code, and it's
styled with `@mariachi/design`: the preset picker in the header restyles the whole explorer. Status:
**alpha**.

## Run it

```bash
mariachi explore             # in a project: serves the explorer for your installed version
pnpm explore:dev             # in this repo: dev server with reload
pnpm explore:build           # in this repo: builds every package, then the site
```

`mariachi explore` needs `@mariachi/explorer` installed (`pnpm add -D @mariachi/explorer`). It serves
the prebuilt site on `http://127.0.0.1:4321/` (`--port`, `--host`, `--open`). CI also publishes the
explorer for `main` to GitHub Pages.

## What's in it

| Section | Content | Source |
| --- | --- | --- |
| Packages | Status, purpose, install, entry points, subpaths, dependencies, used-by, vendor SDKs, error codes, README | each `package.json`, READMEs |
| Docs | Everything in `packages/core/docs/`, including recipes and decisions | markdown |
| API | Every exported symbol per import path, with signatures and JSDoc | each package's built `.d.ts` |
| Reference | Error codes with HTTP status and throw sites; CLI commands; framework tables; dependency graph | source AST, `@mariachi/cli/program`, `@mariachi/schema` |
| Design | Presets with token pages and contrast results, components with examples and tokens, compare view, sample pages, playground | `@mariachi/design` catalog |
| Status | Roadmap and per-package status | `ROADMAP.md` |

`/explorer.json` holds all of it as one JSON document (packages, docs outlines, API, error codes, CLI,
tables, graph, design catalog). Coding agents can read it instead of crawling pages.

## How it's built

Astro builds a static site from **loaders** in `packages/explorer/src/loaders/`. Each loader reads one
source at build time and validates its output with a Zod schema in `src/data/schema.ts`, so bad data
fails the build with the offending file named:

| Loader | Reads |
| --- | --- |
| `packages` | `scripts/lib/packages.mjs`, the same reader as the [package catalog](./packages.md) |
| `docs`, `status` | markdown, rendered with GFM, Shiki (themed by design tokens) and Mermaid; relative links become explorer routes |
| `api` | each package's `exports` → built `.d.ts`, via the TypeScript compiler API (cached by content hash in `.cache/api`) |
| `errors` | a TypeScript AST scan for `new <X>Error('code', …)` where X extends `MariachiError` |
| `cli`, `tables` | `@mariachi/cli/program` and `@mariachi/schema`, imported from their builds |
| `graph` | internal `dependencies` and `peerDependencies` |
| `design` | `@mariachi/design/dist/catalog.json` and CSS |

A link in the docs to a file that doesn't exist fails the build (`explorer/unmapped-link`). Links to
source files go to GitHub.

Pagefind indexes the built HTML for search. Set `EXPLORER_BASE` (and `EXPLORER_SITE`) when serving under
a sub-path, as the Pages deploy does.

### Add a section

1. Add a loader in `src/loaders/` that returns data validated with a schema in `src/data/schema.ts`.
   Wrap it in `once()` so pages share one result.
2. Add pages under `src/pages/`, built from `@mariachi/design` classes and the shell in
   `src/layouts/Base.astro`. Explorer-only CSS lives in `src/styles/explorer.css`, uses tokens only,
   and prefixes classes with `x-`.
3. Add the section to `src/lib/nav.ts`, a loader test in `test/loaders.test.ts`, and the data to
   `src/pages/explorer.json.ts`.

## Tests

| Command | Checks |
| --- | --- |
| `pnpm --filter @mariachi/explorer test:unit` | loaders against the real repo and fixtures |
| `pnpm explore:test` | every route loads with no console errors and no broken internal links; axe on every page, and on key pages in every preset and mode; search, theming, compare, playground, override isolation |
| `pnpm explore:visual` | screenshots of the kitchen sink and sample pages in every preset and mode |

Browser tests need a build first (`pnpm build`). Visual baselines are per platform; the committed ones
are Linux, generated in the Playwright image CI uses:

```bash
docker run --rm --ipc=host -v "$PWD":/work -w /work/packages/explorer \
  mcr.microsoft.com/playwright:v1.64.1-noble \
  node /work/node_modules/@playwright/test/cli.js test --project=visual --update-snapshots
```

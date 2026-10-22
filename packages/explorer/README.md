# @mariachi/explorer

One site for the whole framework: packages, docs, API, error codes, dependency graph, CLI, framework
tables and the design library, with search. Generated from the repo at build time and styled with
`@mariachi/design`.

**Status: alpha.** Covered by loader unit tests and browser tests (every route, axe, behaviour, visual
regression). The published package contains only the built static site.

Guide: [explorer.md](../core/docs/explorer.md)

## Use it

```bash
pnpm add -D @mariachi/explorer
mariachi explore --open
```

The site matches the installed `@mariachi/*` version (all packages share one version).

## Development

```bash
pnpm explore:dev        # dev server (build the other packages first: pnpm build)
pnpm explore:build      # every package, then the site (dist/site) and its search index
pnpm explore:test       # browser checks against the built site
pnpm explore:visual     # visual regression (Linux baselines; see the guide)
```

Loaders live in `src/loaders/`, schemas in `src/data/schema.ts`, pages in `src/pages/`. See
[explorer.md](../core/docs/explorer.md#add-a-section) to add a section.

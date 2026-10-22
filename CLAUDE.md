# Mariachi

Opinionated TypeScript backend framework: a modular monolith of `@mariachi/*` packages behind
config-driven adapters, plus a framework-agnostic design library (`@mariachi/design`) and an explorer
for all of it (`@mariachi/explorer`). This repo is the framework itself.

## Docs

All docs live in [`packages/core/docs/`](packages/core/docs/README.md) (they ship inside
`@mariachi/core`). Read before writing code:

- [`architecture.md`](packages/core/docs/architecture.md): layers, project layout, import boundaries
- [`conventions.md`](packages/core/docs/conventions.md): the rules `mariachi validate` and the lint enforce
- [`patterns.md`](packages/core/docs/patterns.md): composition root, DI keys, context, errors, idempotency
- [`packages.md`](packages/core/docs/packages.md): generated catalog with status (beta/alpha) and entry points
- [`ai-guide.md`](packages/core/docs/ai-guide.md): which piece to use, and common mistakes
- [`design.md`](packages/core/docs/design.md) and [`explorer.md`](packages/core/docs/explorer.md): the design library and the explorer
- [`recipes/`](packages/core/docs/recipes/): entity, job, webhook, integration, wiring

Status and planned work: [`ROADMAP.md`](ROADMAP.md).

## Commands

```bash
pnpm install
pnpm build && pnpm typecheck && pnpm lint
pnpm test:unit
pnpm test:integration   # Docker (Testcontainers) or DATABASE_URL / REDIS_URL / NATS_URL
pnpm docs:check         # links + catalog freshness (after build); run pnpm docs:catalog after editing package.json or design metadata
pnpm explore:dev        # browse everything: packages, docs, API, error codes, design components
pnpm explore:test       # explorer browser checks (after build); explore:visual for screenshots
pnpm changeset          # for every user-facing change
```

## Rules

- `ctx: Context` is the first argument of every operation, including `communication.call(ctx, name, input)`.
- Controllers call procedures; they never import services or database packages.
- Throw `MariachiError` subclasses with a stable `code`, never raw `Error` (`// mariachi-lint-ignore` only with a reason).
- `process.env` only inside `@mariachi/config` (`readEnv`).
- Relative imports are extensionless; import other packages by name or documented subpath.
- Zod at every boundary: routes, procedures, jobs, events, config.
- Vendor SDKs are optional peer dependencies loaded lazily.
- Every package change needs tests; infrastructure behavior needs an `*.integration.test.ts`.
- UI uses `@mariachi/design` markup and overrides tokens, never new selectors or colour literals
  (see the design section of [`conventions.md`](packages/core/docs/conventions.md#design-library)).

## Layout

- `packages/`: the 33 framework packages. Package metadata (`description`, `mariachi`) feeds the catalog.
- `integrations/`: third-party integrations.
- `apps/`, `examples/`: stale reference code predating the current APIs, excluded from build,
  typecheck and lint. Don't copy from them; generate a project with `mariachi init` instead.
- `scripts/`: convention lint, docs link check, catalog generator.

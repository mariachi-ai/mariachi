# Mariachi

Mariachi is an opinionated TypeScript backend framework built so that you, or an AI agent, can put a
production backend together from well-defined pieces instead of re-deciding the same patterns in
every project. It's a set of `@mariachi/*` packages covering HTTP, procedures, data, events, jobs,
realtime, auth, tenancy, billing, notifications, search, AI and more. Each vendor dependency sits
behind a config-selected adapter.

A Mariachi app is a **modular monolith**: controllers call named, Zod-typed procedures through
`@mariachi/communication` instead of importing services, so a domain can later move out of process
without its callers changing.

```
HTTP request
  → Facade      @mariachi/api-facade: Fastify, auth strategies, rate limits, OpenAPI, error envelope
  → Controller  validates the route input, then communication.call(ctx, 'orders.create', input)
  → Procedure   Zod-validated input/output, scopes, timeout
  → Service     business logic: repositories, cache, events (outbox), jobs
```

Status: pre-1.0. See [ROADMAP.md](ROADMAP.md) for what's stable, what's alpha, and what's next.

## Start a project

```bash
npx @mariachi/cli init my-app
cd my-app && pnpm install
docker compose up -d && cp .env.example .env
pnpm db:generate && pnpm db:migrate
pnpm dev                                   # http://localhost:3000/api/health/ready, /api/openapi.json

npx mariachi generate entity order         # schema, contract, repository, service, handler, controller, test
npx mariachi validate                      # architecture and convention checks
```

The generated project includes an `AGENTS.md` that points agents at the framework docs shipped in
`node_modules/@mariachi/core/docs/`.

## Documentation

Everything lives in [`packages/core/docs/`](packages/core/docs/README.md) and ships inside
`@mariachi/core`:

- [Architecture](packages/core/docs/architecture.md), [conventions](packages/core/docs/conventions.md), [patterns](packages/core/docs/patterns.md)
- [Package catalog](packages/core/docs/packages.md), generated from each package's `package.json`
- [AI guide](packages/core/docs/ai-guide.md): which piece to use, and common mistakes
- Guides: [HTTP](packages/core/docs/http.md), [events](packages/core/docs/events.md), [jobs](packages/core/docs/jobs.md), [realtime](packages/core/docs/realtime.md), [CLI](packages/core/docs/cli.md), [runbook](packages/core/docs/runbook.md)
- Recipes: [domain entity](packages/core/docs/recipes/add-domain-entity.md), [background job](packages/core/docs/recipes/add-background-job.md), [webhook](packages/core/docs/recipes/add-webhook-endpoint.md), [integration](packages/core/docs/recipes/add-integration.md), [wiring and bootstrap](packages/core/docs/recipes/wiring-and-bootstrap.md)

## Working on the framework

Requires Node ≥ 20 (CI uses 22), pnpm 9, and Docker for integration tests.

```bash
pnpm install
pnpm build && pnpm typecheck && pnpm lint   # lint includes the convention checks in scripts/
pnpm test:unit
pnpm test:integration                       # Testcontainers, or DATABASE_URL / REDIS_URL / NATS_URL
pnpm docs:check                             # doc links + catalog freshness
docker compose -f docker-compose.dev.yml up -d   # Postgres, Redis, Typesense, Mailpit for manual testing
```

Layout:

```
packages/       framework packages (catalog: packages/core/docs/packages.md)
integrations/   third-party integrations
scripts/        convention lint, docs link check, catalog generator
test/           shared Testcontainers setup
apps/, examples/  stale pre-hardening reference code; excluded from build/typecheck/lint
```

### Releasing

Versions are managed by [Changesets](https://github.com/changesets/changesets), and all `@mariachi/*`
packages share one version. Add a changeset with `pnpm changeset` for every user-facing change. On
`main`, the Release workflow opens a "Version Packages" PR; merging it publishes to npm (needs the
`NPM_TOKEN` secret).

To use a local checkout from another project, run `pnpm build` here, then
`pnpm --filter @mariachi/<pkg> link --global` for each package, and
`pnpm link --global @mariachi/<pkg>` in the consuming project.

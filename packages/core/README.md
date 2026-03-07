# @mariachi/core

Shared types, typed errors, `Context`, DI container, `Result<T,E>`, and retry utilities for the Mariachi framework.

## Framework documentation

When you install any `@mariachi/*` package, this documentation is included so you don't lose the framework's conventions and recipes.

### Quick reference (same as repo `.mariachi/`)

- **[.mariachi/architecture.md](./.mariachi/architecture.md)** — Three-layer flow, import boundaries, naming
- **[.mariachi/conventions.md](./.mariachi/conventions.md)** — TypeScript/ESM, dependency rules, anti-patterns
- **[.mariachi/packages.md](./.mariachi/packages.md)** — All 28 packages and when to use each
- **[.mariachi/patterns.md](./.mariachi/patterns.md)** — Adapter factory, DI container, context, Zod at boundaries

### Full docs

- **[docs/architecture.md](./docs/architecture.md)** — Architecture with mermaid diagrams, package overview, adapter pattern
- **[docs/conventions.md](./docs/conventions.md)** — Same as .mariachi with full detail
- **[docs/packages.md](./docs/packages.md)** — Same as .mariachi
- **[docs/patterns.md](./docs/patterns.md)** — Same as .mariachi
- **[docs/integrations.md](./docs/integrations.md)** — How to add third-party integrations
- **[docs/ai-guide.md](./docs/ai-guide.md)** — Decision trees, package cheat sheet, common gotchas
- **[docs/runbook.md](./docs/runbook.md)** — Environment variables, CLI commands, validation
- **[docs/adr/001-adapter-pattern.md](./docs/adr/001-adapter-pattern.md)** — ADR: adapter pattern
- **[docs/improvements/](./docs/improvements/)** — Draft improvements (e.g. notifications/realtime/NATS)

### Step-by-step recipes

- [docs/recipes/add-domain-entity.md](./docs/recipes/add-domain-entity.md) — Schema, repository, service, handler, controller, tests
- [docs/recipes/add-background-job.md](./docs/recipes/add-background-job.md) — Job definition, worker registration, scheduling
- [docs/recipes/add-webhook-endpoint.md](./docs/recipes/add-webhook-endpoint.md) — WebhookController with direct/queue modes
- [docs/recipes/add-integration.md](./docs/recipes/add-integration.md) — Third-party integration with credentials and retry
- [docs/recipes/wiring-and-bootstrap.md](./docs/recipes/wiring-and-bootstrap.md) — Full initialization order from config to running servers

### Cursor / AI assistants

A Cursor rule file is included so your IDE can use the framework conventions:

- **Copy** `node_modules/@mariachi/core/.cursor/rules/mariachi.mdc` into your project's `.cursor/rules/` (e.g. as `mariachi.mdc`). The rule points the AI at the docs in this package.

After `pnpm add @mariachi/core`, all of the above paths are available under `node_modules/@mariachi/core/`.

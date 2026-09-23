# @mariachi/core

Foundation types for every Mariachi package:

- `Context`, plus the AsyncLocalStorage context store: `runWithContext`, `currentContext`, `requireContext`.
- Typed errors: `MariachiError` and its subclasses, `toErrorEnvelope`, `errorToHttpStatus`, `fromZodError`.
- The DI container with typed keys: `createContainer`, `createKey`, `KEYS`.
- `Result<T, E>`.
- `retry` and `withTimeout`.
- Instrumentation helpers: `withSpan`, `timed`.
- Idempotency: `IdempotencyStore`, `runOnce`.
- `loadOptionalPeer` for lazily loaded vendor SDKs.

## Framework documentation

The framework docs ship inside this package, so they're available in any project at
`node_modules/@mariachi/core/docs/`. Start at [docs/README.md](./docs/README.md).

- [docs/architecture.md](./docs/architecture.md): layers, project layout, import boundaries
- [docs/conventions.md](./docs/conventions.md): the rules `mariachi validate` enforces
- [docs/patterns.md](./docs/patterns.md): composition root, DI, context, errors, idempotency
- [docs/packages.md](./docs/packages.md): generated catalog of every package with status and entry points
- [docs/ai-guide.md](./docs/ai-guide.md): which piece to use, and common mistakes
- [docs/cli.md](./docs/cli.md): `mariachi init`, `generate`, `validate`, `db`
- Topic guides: [http](./docs/http.md), [events](./docs/events.md), [jobs](./docs/jobs.md), [realtime](./docs/realtime.md), [integrations](./docs/integrations.md), [auth](./docs/auth-and-providers.md), [runbook](./docs/runbook.md)
- Recipes: [domain entity](./docs/recipes/add-domain-entity.md), [background job](./docs/recipes/add-background-job.md), [webhook endpoint](./docs/recipes/add-webhook-endpoint.md), [integration](./docs/recipes/add-integration.md), [wiring and bootstrap](./docs/recipes/wiring-and-bootstrap.md)

## AI assistants

Projects created with `mariachi init` include an `AGENTS.md` that points here. For Cursor, copy
`node_modules/@mariachi/core/.cursor/rules/mariachi.mdc` into your project's `.cursor/rules/`.

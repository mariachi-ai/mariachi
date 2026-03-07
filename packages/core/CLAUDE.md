# Mariachi Framework

TypeScript backend framework built as a modular monolith. 28 packages covering auth, billing, jobs, notifications, search, AI, and more -- all behind adapter-based abstractions driven by config.

## Commands

```bash
pnpm install          # Install dependencies
pnpm run build        # Build all packages (Turborepo)
pnpm run dev          # Dev mode (watch)
pnpm run test         # Run tests (Vitest, watch mode)
pnpm run test:run     # Single test run (CI)
pnpm run typecheck    # Type checking
pnpm run lint         # Linting
```

## Architecture

Three-layer request flow: Facade (Fastify + auth + rate limiting) → Controller (Zod validation + `communication.call()`) → Service (business logic, DB, cache, events). Controllers never import services directly.

Read these files for full context:
- `.mariachi/architecture.md` — layers, import boundaries, naming conventions
- `.mariachi/conventions.md` — TypeScript/ESM rules, dependency rules, anti-patterns
- `.mariachi/patterns.md` — adapter factory, DI container, context propagation, Zod at boundaries
- `.mariachi/packages.md` — all 28 packages with when to use each
- `docs/ai-guide.md` — decision trees, package cheat sheet, common gotchas

## Conventions

- Relative imports are extensionless: `import { foo } from './bar'` (not `'./bar.js'`)
- Cross-package imports: bare specifiers (`import { Context } from '@mariachi/core'`)
- All packages use ESM (`"type": "module"`) and build with tsup
- TypeScript strict mode, ES2022 target, `moduleResolution: "bundler"`
- Validate with Zod at boundaries (controller input, handler schemas, job payloads)
- Throw typed errors (`MariachiError` subclasses), never raw `Error`
- Every operation takes `Context` as first argument — never drop context between layers
- Soft deletes by default (`deletedAt` column); hard deletes require explicit opt-in

## Structure

- `apps/api/` — HTTP servers + controllers
- `apps/services/` — domain services + communication handlers
- `apps/worker/` — BullMQ job workers
- `packages/` — 28 shared framework packages
- `integrations/` — third-party integrations (Slack, etc.)
- `docs/recipes/` — step-by-step guides for common tasks

## Recipes

For step-by-step instructions, read the relevant recipe before generating code:
- `docs/recipes/add-domain-entity.md` — schema → repository → service → handler → controller → tests
- `docs/recipes/add-background-job.md` — job definition, registration, scheduling, enqueuing
- `docs/recipes/add-webhook-endpoint.md` — WebhookController with direct/queue modes
- `docs/recipes/add-integration.md` — third-party integration with credentials and retry
- `docs/recipes/wiring-and-bootstrap.md` — full initialization order from config to running servers

## Do Not

- Import services from controllers — use `communication.call()` instead
- Use `process.env` outside `@mariachi/config` — use `loadConfig()` / `useConfig()`
- Expose the Drizzle client directly — use `DrizzleRepository` subclasses
- Hardcode adapter choices — use factory functions (`createCache`, `createSearch`)
- Hand-write migration files — use the `defineTable` DSL
- Register duplicate procedure names — they silently overwrite
- Reference `CORE_CONCEPT.md` for current APIs — it describes planned features that don't exist yet

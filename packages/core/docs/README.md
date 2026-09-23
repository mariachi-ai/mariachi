# Mariachi docs

Mariachi is an opinionated TypeScript backend framework: a modular monolith of `@mariachi/*` packages
behind adapters chosen by config. The opinions exist so that people and coding agents write the same
code the same way.

These docs ship inside `@mariachi/core` (`node_modules/@mariachi/core/docs/`) and are the single
source of truth. Files elsewhere (`CLAUDE.md`, `.cursor/rules`, a generated project's `AGENTS.md`)
only point here.

## Read first

1. [architecture.md](./architecture.md): layers, request flow, project layout, import boundaries
2. [conventions.md](./conventions.md): rules that `mariachi validate` and the lint enforce, and why
3. [patterns.md](./patterns.md): composition root, DI keys, context, errors, adapters, lifecycle
4. [packages.md](./packages.md): generated catalog of every package, with status and entry points

## Guides

- [cli.md](./cli.md): `mariachi init`, `generate`, `validate`, `db`
- [http.md](./http.md): `server` vs `api-facade` vs `webhooks`, routes, auth strategies, rate limits, OpenAPI
- [events.md](./events.md): envelopes, consumer groups, delivery guarantees, dead letters, outbox
- [jobs.md](./jobs.md): `defineJob`, retries, dedup, scheduling, hooks, dead-letter queue
- [realtime.md](./realtime.md): WebSockets, channel authorization, presence, multi-instance fanout
- [billing.md](./billing.md): Stripe with a local mirror, idempotent money movement, credits, replayable webhooks
- [notifications.md](./notifications.md): channels, preferences, queued delivery and delivery tracking
- [ai.md](./ai.md): sessions, budgets, cost, provider fallback, streaming
- [audit.md](./audit.md): append-only log, hash chain verification, retention and export
- [auth-and-providers.md](./auth-and-providers.md): identity providers, RBAC, API keys, webhook dedup
- [feature-flags.md](./feature-flags.md): tenant overrides, rollouts, caching
- [storage.md](./storage.md), [search.md](./search.md), [integrations.md](./integrations.md)
- [testing.md](./testing.md): doubles, contract suites, integration tests
- [runbook.md](./runbook.md)
- [ai-guide.md](./ai-guide.md): decision trees and gotchas for coding agents

## Recipes

- [add-domain-entity.md](./recipes/add-domain-entity.md): table, repository, service, handler, controller, tests
- [add-background-job.md](./recipes/add-background-job.md)
- [add-webhook-endpoint.md](./recipes/add-webhook-endpoint.md)
- [add-integration.md](./recipes/add-integration.md)
- [wiring-and-bootstrap.md](./recipes/wiring-and-bootstrap.md): the composition root, step by step

## Decisions

- [adr/001-adapter-pattern.md](./adr/001-adapter-pattern.md)

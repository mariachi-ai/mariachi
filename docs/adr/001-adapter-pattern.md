# ADR 001: Adapter Pattern for External Dependencies

## Status

Accepted

## Context

The framework integrates with many external systems: databases (PostgreSQL), caches (Redis), message queues (BullMQ), payment providers (Stripe), search engines (Typesense), AI providers (OpenAI), and others. Direct use of vendor SDKs creates:

- **Vendor lock-in** — Switching providers requires large refactors.
- **Testing friction** — Real services are slow and brittle in tests.
- **Configuration sprawl** — Each vendor has different setup patterns.

## Decision

All external dependencies are placed behind adapters. Each package exposes:

1. A **common interface** (e.g., `CacheClient`, `SearchClient`).
2. A **factory function** (e.g., `createCache`, `createSearch`) that selects the implementation from config.
3. **Multiple implementations** — at least one production adapter (Redis, Stripe, etc.) and one in-memory adapter for tests.

Config drives the choice:

```ts
createCache({ adapter: 'redis', url: '...' });  // production
createCache({ adapter: 'memory' });              // tests
```

## Consequences

**Positive:**

- Full portability: swap Redis for another cache without changing application code.
- Tests run fast with in-memory adapters; no external services required.
- Consistent configuration pattern across packages.

**Negative:**

- More code: each adapter is a thin wrapper around the vendor SDK.
- New adapters require implementing the full interface.
- Some vendor-specific features may not map cleanly to the abstraction.

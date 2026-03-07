# Mariachi Runbook

Operational guide for developing and running Mariachi applications.

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** (package manager)

## Getting Started

```bash
pnpm install
pnpm run build
pnpm run dev
```

## Running Tests

```bash
pnpm run test
```

For a single run (CI):

```bash
pnpm run test:run
```

## Adding a New Service

Generate a service with handlers and tests (if using `@mariachi/cli`):

```bash
mariachi generate service <name>
```

Example:

```bash
mariachi generate service orders
```

Creates a domain folder with `orders.service.ts`, `orders.handler.ts`, and tests.

## Adding a New Integration

Generate an integration scaffold (if using `@mariachi/cli`):

```bash
mariachi generate integration <name>
```

## Validating

Validate project structure and conventions (if using `@mariachi/cli`):

```bash
mariachi validate
```

Optionally specify a path:

```bash
mariachi validate ./apps
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` / `ENV` | Environment (`development`, `test`, `production`) | — |
| `PORT` | Public API port | `3000` |
| `ADMIN_PORT` | Admin API port | `3001` |
| `WEBHOOK_PORT` | Webhook server port | `3002` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `DATABASE_ADAPTER` | Database adapter | `postgres` |
| `DATABASE_POOL_MIN` | Connection pool minimum | `2` |
| `DATABASE_POOL_MAX` | Connection pool maximum | `10` |
| `REDIS_URL` | Redis connection string | — |
| `JWT_SECRET` | JWT signing secret | — |
| `SESSION_SECRET` | Session secret (fallback for JWT) | — |

Configuration is loaded via `@mariachi/config`; avoid using `process.env` directly outside that package.

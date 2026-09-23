# Runbook

## Running an app

```bash
cp .env.example .env && docker compose up -d   # Postgres + Redis
pnpm db:migrate                                # mariachi db migrate
pnpm dev
```

### Deploying

1. CI: `tsc --noEmit`, `mariachi validate`, `mariachi db check` (fails if a schema change has no
   migration), tests.
2. Before starting the new version, run `mariachi db migrate`. It takes an advisory lock, so concurrent
   deploy jobs don't race.
3. Health probes (under the API prefix):
   - `/health/live`: process is up; use for liveness.
   - `/health/startup`: startup hooks finished; use for the startup probe.
   - `/health/ready`: every critical resource is healthy; 503 while starting or draining.
4. Give the platform a termination grace period longer than `SHUTDOWN_TIMEOUT_MS` (default 15s). On
   SIGTERM, readiness flips to 503, transports stop, jobs drain, and connections close in reverse
   start order.

### Operating jobs and events

- Dead-lettered jobs: `jobs.listDeadLetters()`, then `jobs.retryDeadLetter(id)` after fixing the
  cause. Expose both through an admin-only procedure.
- Dead-lettered events: Redis Streams entries past `maxDeliveries` land in `<prefix>:dead-letter`;
  handler failures go to the configured `DeadLetterSink`.
- Outbox backlog: `SELECT count(*) FROM mariachi_event_outbox WHERE published_at IS NULL`. A growing
  count means the relay is down or the bus is failing (check `last_error`).

## Environment

Read by `@mariachi/config` (`buildConfigFromEnv`). Unset values fall back to defaults; invalid values
fail the boot with `ConfigError`.

| Variable | Setting | Default |
| --- | --- | --- |
| `NODE_ENV` / `ENV` | `development`, `test`, `production` | `development` |
| `SERVICE_NAME` | service name in logs, traces and prefixes | `mariachi` |
| `HOST`, `PORT`, `ADMIN_PORT`, `WEBHOOK_PORT` | bind address and ports | `0.0.0.0`, 3000, 3001, 3002 |
| `TRUST_PROXY`, `CORS_ORIGINS`, `BODY_LIMIT_BYTES`, `SHUTDOWN_TIMEOUT_MS` | HTTP server | off, none, 1 MiB, 15000 |
| `DATABASE_URL`, `DATABASE_POOL_MIN`, `DATABASE_POOL_MAX` | Postgres | none, 2, 10 |
| `REDIS_URL` | Redis for cache, jobs, events, rate limits, realtime | none |
| `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_EXPIRES_IN`, `SESSION_SECRET` | auth (secrets are at least 32 chars) | none, `1h` for expiry |
| `ENCRYPTION_ADAPTER`, `ENCRYPTION_KEY`, `ENCRYPTION_KEY_VERSION` | encryption | `local`, none, 1 |
| `LOG_ADAPTER`, `LOG_LEVEL` | logging (`pino` or `console`) | `pino`, `info` |
| `TRACING_ADAPTER`, `OTEL_EXPORTER_OTLP_ENDPOINT` / `..._TRACES_ENDPOINT` | OpenTelemetry tracing | off |
| `METRICS_ADAPTER`, `METRICS_PREFIX`, `ERRORS_ADAPTER`, `SENTRY_DSN` | metrics and error tracking | noop |
| `STORAGE_*`, `EMAIL_*`, `RESEND_API_KEY`, `SMTP_URL`, `STRIPE_*`, `SEARCH_ADAPTER`, `TYPESENSE_*`, `AI_*`, `OPENAI_API_KEY` | domain packages | see each package |

## Developing the framework

```bash
pnpm install
pnpm build                 # packages and integrations; apps/ and examples/ are excluded (stale, see ROADMAP.md)
pnpm typecheck
pnpm lint                  # biome + scripts/lint-conventions.mjs
pnpm test:unit
pnpm test:integration      # needs Docker (Testcontainers), or set DATABASE_URL / REDIS_URL / NATS_URL
pnpm docs:check            # broken links + stale package catalog
pnpm docs:catalog          # regenerate packages.md after editing package.json metadata
pnpm changeset             # describe every user-facing change; versions move together
```

Integration tests live in `*.integration.test.ts` and run one package at a time. The `create`
package's integration test scaffolds a project, typechecks it against the built packages and runs its
tests, so an API change that breaks generated code fails CI.

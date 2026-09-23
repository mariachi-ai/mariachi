# @mariachi/config

Typed, validated configuration built from environment variables and overrides, plus secrets and
feature flags. It is the only package that reads `process.env`.

**Status: beta.** Covered by unit tests and Postgres integration tests (feature flag store). The
API can change before 1.0.

Guides: [feature-flags.md](../core/docs/feature-flags.md), [conventions.md](../core/docs/conventions.md) (why only this package reads `process.env`)

## Imports

| Import | Contents |
| --- | --- |
| `@mariachi/config` | `loadConfig`, `useConfig`, sections, secrets, feature flags |
| `@mariachi/config/schema` | `featureFlagsTable` |
| `@mariachi/config/postgres` | `DrizzleFeatureFlagStore` |

## Public API

| Export | Purpose |
| --- | --- |
| `loadConfig(overrides?, options?)` / `useConfig()` | Build (once) and read the validated `AppConfig`; invalid input throws `ConfigError` with readable issues |
| `registerConfigSection` / `useConfigSection` | Typed, validated config for your own modules |
| `createSecrets(config)`, `Secrets`, `EnvSecretsAdapter` | Secrets, optionally per tenant |
| `createFeatureFlags(config)` | `'store'` (cached, tenant overrides, rollouts) or `'static'` flags |
| `DrizzleFeatureFlagStore` | `get`, `set`, `setTenantOverride` on the `feature_flags` table |
| `evaluateFlag`, `CachedFeatureFlags`, `StoreFeatureFlagAdapter`, `StaticFeatureFlagAdapter` | Building blocks |

## Environment

`buildConfigFromEnv` maps well-known variables onto the config: `PORT`, `DATABASE_URL`,
`REDIS_URL`, `JWT_*`, `ENCRYPTION_*`, `STORAGE_*`, `STRIPE_*`, `EMAIL_*`/`RESEND_API_KEY`/`SMTP_URL`,
`TYPESENSE_*`, `AI_*`/`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, `LOG_*`, `OTEL_*`, `SENTRY_DSN` and more.
List and JSON variables (`CORS_ORIGINS`, `AI_FALLBACK_MODELS`, `AI_COST_TABLE`) are parsed, and
invalid JSON is a `ConfigError`, not a silent default.

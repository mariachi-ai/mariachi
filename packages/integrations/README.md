# @mariachi/integrations

Building blocks for third-party integrations: functions with validated input and output and
retries, per-tenant credentials (optionally encrypted), a registry that can call functions by name,
and webhook signature checks. `integrations/slack/` in this repository is the reference
implementation.

**Status: beta.** Covered by unit tests. The API can change before 1.0.

Guide: [integrations.md](../core/docs/integrations.md), recipe: [add-integration.md](../core/docs/recipes/add-integration.md)

## Public API

| Export | Purpose |
| --- | --- |
| `defineIntegrationFn(def)` | `{ name, input, output, handler, retry? }` → a callable function; input is validated once, and missing credentials and invalid input aren't retried |
| `defineWebhookHandler(def)` | `{ verify, parse, handle }`, verified before parsing |
| `IntegrationRegistry` | `register` (every listed function needs a handler), `get`, `getAll`, `call(name, input, ctx)` |
| `resolveTenantCredential(ctx, key, secrets, decryptor?, options?)` | Tenant secret, then global unless `fallbackToGlobal: false`; decrypted when a decryptor is given |
| `verifySlackSignature`, `assertSlackSignature` | Slack `v0` signatures with a five-minute replay window |

## Config

Integrations read credentials from `@mariachi/config` secrets (per tenant where needed); nothing
is read from the environment directly. `retry` is `{ attempts, backoff: 'exponential' | 'linear' }`.
Errors are `IntegrationError`: `integrations/invalid-input`, `integrations/invalid-output`,
`integrations/missing-credential`, `integrations/call-failed`, `integrations/invalid-signature`,
`integrations/missing-handler`, `integrations/duplicate`, `integrations/unknown-function` and
`integrations/ambiguous-function`.

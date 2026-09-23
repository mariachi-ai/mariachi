# @mariachi/auth

Authentication and authorization: JWT and OAuth (PKCE), sessions, API keys with scopes and
rotation, database-backed RBAC with caching, brute-force protection, and a dispatcher for identity
provider webhooks. Provider packages (`@mariachi/auth-clerk`, `@mariachi/auth-fusionauth`)
implement its contracts.

**Status: beta.** Covered by unit tests and Postgres integration tests. The API can change before 1.0.

Guide: [auth-and-providers.md](../core/docs/auth-and-providers.md)

## Imports

| Import | Contents |
| --- | --- |
| `@mariachi/auth` | Adapters, RBAC, API keys, middleware, webhook dispatcher, brute-force protection |
| `@mariachi/auth/schema` | `roles`, `permissions`, `user_roles`, `api_keys`, `sessions`, `auth_webhook_dedup` tables |
| `@mariachi/auth/postgres` | `DrizzleRoleStore`, `DrizzleApiKeyStore`, `DrizzleWebhookDedup` |

## Public API

| Export | Purpose |
| --- | --- |
| `createAuth(config)` | `JWTAdapter` or `ApiKeyAdapter` |
| `createAuthorization(config)` | `RBACAdapter`: `can`, `grant`, `revoke`, `getRoles`, `refreshPermissions` |
| `DrizzleRoleStore` | Role assignments, `defineRole`, and the permission source for RBAC |
| `CachedRoleStore` | Caches role lookups in any `get/set/del` cache |
| `ApiKeyService` | `issue`, `verify`, `rotate`, `revoke` over `DrizzleApiKeyStore` or `MemoryApiKeyStore` |
| `createAuthWebhookDispatcher` | Verified, deduplicated provider webhooks to communication procedures |
| `OAuthAdapter`, `BruteForceProtector`, `createAuthMiddleware` | OAuth flows, lockouts, middleware |

## Config

| Setting | Env | Notes |
| --- | --- | --- |
| `auth.adapter` | `AUTH_ADAPTER` | `'jwt'` or `'api-key'` |
| `jwtSecret` / `jwtPublicKey` + `jwtPrivateKey` | `JWT_SECRET` | HS* secret or RS/ES key pair |
| `jwtIssuer`, `jwtAudience`, `jwtExpiresIn` | `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_EXPIRES_IN` | Checked on verify |

RBAC (`createAuthorization`): `store`, `permissionSource`, `permissionTtlMs` (default 30s),
`permissions`, `roles` (inheritance), `superuserScope`. Errors are `AuthError`.

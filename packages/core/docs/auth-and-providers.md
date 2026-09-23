# Auth and Provider Packages

How `@mariachi/auth`, `@mariachi/auth-clerk`, and `@mariachi/auth-fusionauth` work together for authentication and multi-tenant identity.

## Contract, not tight coupling

They are **loosely coupled** through a shared contract defined in `@mariachi/auth`:

- **`ResolvedIdentity`** — Every provider returns the same shape: `userId`, `tenantId`, `scopes`, `identityType`, and optional `sessionId` / `apiKeyId`.
- **`AuthProvider`** — Third-party providers (Clerk, FusionAuth) implement: `verify(token) → Promise<ResolvedIdentity>` and `createWebhookHandler(config) → AuthWebhookHandler`.

The core auth package does **not** import or depend on auth-clerk or auth-fusionauth. The provider packages depend only on `@mariachi/auth` (and `@mariachi/core`) for types and interfaces. Your app wires the chosen provider into the same middleware and context flow.

## Multi-tenant identity

Multi-tenant auth is consistent because every provider maps its own concepts into the same `ResolvedIdentity`:

| Provider   | Tenant source in token        | Roles/scopes source   |
|-----------|--------------------------------|------------------------|
| **Clerk** | `org_id` → `tenantId`         | `org_role` → `scopes` |
| **FusionAuth** | `applicationId` → `tenantId` | `roles[]` → `scopes`   |
| **JWT** (core) | `tenantId` claim            | Custom claims / `scopes` |

After verification, the rest of the stack (controllers, services, RBAC, tenancy) only sees `ctx.userId`, `ctx.tenantId`, and `ctx.scopes`. Authorization (`AuthorizationAdapter`) is tenant-aware: `grant(userId, role, tenantId)` and `can(identity, action, resource)` use `identity.tenantId` so roles are per-tenant.

## Flow: request → identity → context

1. **HTTP request** — Bearer token (or API key) is sent (e.g. `Authorization: Bearer <token>`).

2. **Who verifies the token**
   - **Built-in adapters** (`@mariachi/auth`): Use `createAuth(config)` with `adapter: 'jwt'` or `adapter: 'api-key'`. You get an `AuthenticationAdapter` used by `createAuthMiddleware(adapter)`.
   - **Third-party providers** (Clerk, FusionAuth): Use the provider as the “verify” implementation. The provider’s `verify(token)` returns `ResolvedIdentity`. You can use:
     - **Provider-specific middleware** — e.g. `createClerkMiddleware(provider)` from `@mariachi/auth-clerk` — which calls `provider.verify(token)` and sets `ctx.userId`, `ctx.tenantId`, `ctx.scopes`, etc.
     - **Core middleware** — `createAuthMiddleware(adapter)` from `@mariachi/auth` expects an `AuthenticationAdapter` (verify + sign). Providers only implement verify; for sign you’d use a small wrapper or a separate JWT signer if you need to issue tokens yourself.

3. **Context** — Middleware (or the API facade’s auth step) sets `ctx.userId`, `ctx.tenantId`, `ctx.scopes`, `ctx.identityType`. Controllers and services use this context; they do not care which provider produced it.

4. **Authorization** — `Auth.authorize(ctx, action, resource)` (and RBAC) uses `ctx.userId`, `ctx.tenantId`, and `ctx.scopes` from the same context.

## Package roles

| Package | Role |
|--------|------|
| **`@mariachi/auth`** | Defines `ResolvedIdentity`, `AuthenticationAdapter`, `AuthProvider`, `AuthWebhookHandler`; provides `createAuth` (JWT, API key), `createAuthMiddleware`, `createAuthWebhookDispatcher`, RBAC. No dependency on any specific IdP. |
| **`@mariachi/auth-clerk`** | Implements `AuthProvider`: verifies Clerk JWTs, maps `org_id` → `tenantId`, `org_role` → scopes; provides `createClerkAuth()`, `createClerkMiddleware(provider)`, Clerk webhook handler and controller. |
| **`@mariachi/auth-fusionauth`** | Implements `AuthProvider`: verifies FusionAuth JWTs via JWKS, maps `applicationId` → `tenantId`, `roles` → scopes; provides `createFusionAuthAuth()`, `FusionAuthWebhookHandler` (sync verify with HMAC or PEM). |

## Webhooks

- **Auth webhook flow** — `createAuthWebhookDispatcher` (from `@mariachi/auth`) takes any `AuthWebhookHandler`. Clerk and FusionAuth each provide a handler via `provider.createWebhookHandler({ secret })`. The dispatcher verifies the webhook (using the handler), normalizes the event to `AuthWebhookEvent`, and calls communication procedures (e.g. `auth.user.created`). Same flow for both providers; only the verification and event parsing are provider-specific.

## Authorization (RBAC)

Roles are per tenant. Assignments live in `user_roles`, and each role's permissions live on its
`roles.permissions` row as `{ action, resource }` pairs (`*` matches any action or resource).
`DrizzleRoleStore` provides both, so pass it as the role store and the permission source:

```ts
import { createAuthorization, CachedRoleStore } from '@mariachi/auth';
import { DrizzleRoleStore } from '@mariachi/auth/postgres';

const roles = new DrizzleRoleStore(db);
const rbac = createAuthorization({
  store: new CachedRoleStore(roles, cache, 30),        // assignments cached 30s, dropped on grant/revoke
  permissionSource: roles,                             // permissions loaded on first check, reloaded after permissionTtlMs
  permissionTtlMs: 30_000,
  permissions: [{ role: 'owner', action: '*', resource: '*' }],   // code-defined permissions merge in
  roles: [{ name: 'admin', inherits: ['member'] }],
  superuserScope: 'platform:admin',
});

await roles.defineRole('editor', [{ action: 'update', resource: 'posts' }, { action: 'read', resource: '*' }]);
await rbac.grant(userId, 'editor', tenantId);
await rbac.can(identity, 'update', 'posts');            // checks identity.tenantId's roles plus token roles
```

After `defineRole`, call `rbac.refreshPermissions()` to apply it in this process right away; other
processes reload after `permissionTtlMs`. Granting a role that doesn't exist throws
`auth/unknown-role`.

## API keys

`ApiKeyService` issues tenant API keys, stores only their hash (`api_keys` table via
`DrizzleApiKeyStore`), and checks scopes and expiry on `verify`.

```ts
const keys = new ApiKeyService(new DrizzleApiKeyStore(db));
const { key, id } = await keys.issue(ctx, { name: 'CI', scopes: ['reports:read'], expiresAt });   // show `key` once
const rotated = await keys.rotate(ctx, id);   // new secret, same scopes; the old key stops working
await keys.revoke(ctx, rotated.id);
```

Rotation writes the new key before revoking the old one, so a failure midway never leaves the
tenant without a working key. Keys belonging to another tenant are reported as not found.

## Webhook dedup

Auth providers retry webhooks. Give `createAuthWebhookDispatcher` an `idempotency` store shared by
every instance, either `RedisIdempotencyStore` from `@mariachi/cache` or `DrizzleWebhookDedup` from
`@mariachi/auth/postgres`. Without one it logs a warning and reprocesses duplicates.
`DrizzleWebhookDedup` claims an event with one conditional upsert, so concurrent deliveries of the
same event can't both process it; an expired claim (a crashed worker) can be taken over.

## Summary

- **Tight coupling is not required.** The coupling is the shared **contract**: `ResolvedIdentity` and `AuthProvider` (and optionally `AuthenticationAdapter` for middleware).
- **Multi-tenant auth** is unified: every provider fills `userId`, `tenantId`, and `scopes` the same way; RBAC and tenancy use that single shape.
- **Wiring:** Use one provider per app (or one “session” provider plus API key). Create the provider (e.g. `createFusionAuthAuth(config)` or `createClerkAuth(config)`), then use its middleware (or a thin adapter) so that after auth, `ctx` is populated with the same identity shape regardless of provider.

---
'@mariachi/auth': minor
'@mariachi/tenancy': patch
'@mariachi/api-facade': patch
---

The verified token's claims now reach tenancy. `createAuthMiddleware` sets `ctx.jwtClaims` from
`ResolvedIdentity.claims` (new `AuthenticatedContext` type), the API facade's `ResolvedIdentity` type
declares the `claims` its verifiers already return on `ctx.identity`, and `@mariachi/tenancy`'s
`jwt-claim` strategy reads `ctx.jwtClaims` or, on an HTTP context, `ctx.identity.claims`. Before, nothing
set `ctx.jwtClaims`, so `jwt-claim` never resolved a tenant. Providers that return no claims are
unaffected.

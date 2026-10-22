---
"@mariachi/auth": minor
"@mariachi/auth-fusionauth": minor
"@mariachi/auth-workos": minor
---

`IdentityClient` in `@mariachi/auth`: the calls an app's own backend makes to its identity provider (password sign-in, the social sign-in redirect and code exchange, refresh, sign-out, user lookups), so an app can switch providers by configuration. New `@mariachi/auth-workos`: WorkOS AuthKit token verification (JWKS, issuer, `client_id`, or `audience` for MCP tokens), `WorkOS-Signature` webhooks, and `createWorkOSIdentityClient` on `@workos-inc/node` (an optional peer). `@mariachi/auth-fusionauth` adds `createFusionAuthIdentityClient` and `fusionAuthEmailVouched`; its existing exports are unchanged.

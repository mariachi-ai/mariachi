---
'@mariachi/auth-gotrue': minor
---

`discoverIssuer: true` reads the issuer from GoTrue's `/.well-known/openid-configuration` (re-read after
`jwksCacheMaxAgeMs`, like the JWKS) instead of assuming `url`, for an app that reaches GoTrue on an
internal address and doesn't know its public origin (an Ensemble preview: `url: 'http://127.0.0.1:9999'`).
It fails closed when the document can't be read or names no issuer, and can't be combined with `issuer`.
Tests now pin the claims `verify` keeps for tenancy and roles: `org_id`, `org_role`, `app_metadata`, `act`.

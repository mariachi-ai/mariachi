---
'@mariachi/auth-gotrue': minor
---

New package `@mariachi/auth-gotrue`: an `AuthProvider` for GoTrue (Supabase Auth). `verify` checks access tokens
against GoTrue's JWKS (ES256 by default, never HMAC) with issuer and audience, and maps `sub`, `session_id`, the
org claim and `role`/`roles`/`org_role` onto `ResolvedIdentity`, keeping the whole payload in `claims`.
`createWebhookHandler` verifies GoTrue's HTTP hooks (Standard Webhooks), fails closed, and normalizes them to
`AUTH_EVENT_TYPES`.

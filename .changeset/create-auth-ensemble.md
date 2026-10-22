---
'@mariachi/create': minor
'@mariachi/cli': minor
---

`mariachi init --auth ensemble` (`createProject({ auth: 'ensemble' })`): a project that signs users in
with Ensemble's per-app auth. `@mariachi/auth-gotrue` verifies GoTrue's tokens (configured from
`AUTH_URL`, `AUTH_ORIGIN` or `APP_ORIGIN`, else GoTrue on the preview's loopback with its issuer
discovered), `@mariachi/tenancy` takes the tenant from the `org_id` claim, and roles include `org_role`
(`GET /api/me`; `GET /api/me/admin` admits owners and admins). It also writes `ensemble.environment.json` (the environment's
settings in the shape of Ensemble's environment config: Compose with Postgres and Redis, the `/` route,
`auth` with `seedUsers`), `seed/users.yaml` (the project's organization, an admin and a member persona; Ensemble's layer creates the memberships), `.env.ensemble` (what a
preview runs with, loaded under `.env`; migrations applied at start) and an example sign-in page at
`/api/sign-in` (password, sign-up and magic link with plain fetch). The default (`--auth jwt`) is
unchanged.

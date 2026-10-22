---
'@mariachi/api-facade': minor
---

`FastifyAdapter.configure(fn)`: direct access to the Fastify instance before it starts, for hooks that run before authentication and routes that set cookies or redirect (an OAuth callback). It forwards to `@mariachi/server`'s `configure`.

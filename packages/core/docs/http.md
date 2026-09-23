# HTTP

Three packages, stacked:

| Package | Role | Use it for |
| --- | --- | --- |
| `@mariachi/server` | Transport. Fastify with request ids, `traceparent` propagation, body limits, raw body capture, CORS, security headers, request timeouts, graceful close, the error envelope. No auth or policy. | Only when building a new kind of HTTP surface. |
| `@mariachi/api-facade` | Public API policy on top of `server`: controllers, Zod-validated routes, auth strategies, scopes, rate limits, OpenAPI, health endpoints. | Every client-facing endpoint. |
| `@mariachi/webhooks` | Inbound webhook policy on top of `server`: signature/API key/OAuth verification over the raw body, delivery dedup, request logging, direct or queued processing. | Stripe, GitHub, auth-provider callbacks, any signed sender. |

Run the API and webhook servers on different ports (`PORT`, `WEBHOOK_PORT`) so their auth and body
limits never mix.

## API server

```ts
const api = createApiServer({ name: 'api', prefix: '/api', logger, tracer, cors: { origins: ['https://app.example.com'] } })
  .withAuthStrategy('session', bearerStrategy(new JWTAdapter({ secret })))
  .withAuthStrategy('api-key', apiKeyStrategy(apiKeyVerifier))
  .withAuth(['session', 'api-key'])                  // default for routes that don't set `auth`
  .withRateLimit({ limiter: createRateLimiter({ adapter: 'redis', url }), default: { windowMs: 60_000, maxRequests: 300 } })
  .withHealth(lifecycle.health)                     // /api/health/live, /ready, /startup (under the prefix)
  .withOpenApi({ info: { title: 'My API', version: '1.0.0' } }); // /api/openapi.json

api.registerController(new NotesController(communication));
await api.listen(3000);
```

A strategy returns an identity when its credentials are present and valid, returns `null` when they're
absent (the next strategy is tried), and throws `AuthError` when they're present but invalid. Built in:
`bearerStrategy` (JWT or session verifier), `apiKeyStrategy` (`x-api-key`), `serviceTokenStrategy`
(pre-shared tokens compared in constant time; a service may act in a tenant via `x-tenant-id`) and
`hmacSignatureStrategy`.

## Controllers and routes

```ts
export class NotesController extends BaseController {
  readonly prefix = 'notes';          // → /api/notes
  readonly tags = ['notes'];          // OpenAPI tags

  init(): void {
    this.post('/', { schema: { body: createNoteInput, response: noteSchema }, status: 201 }, (ctx, body) =>
      this.call<NoteDto>(ctx, 'notes.create', body),
    );
    this.get('/:id', { schema: { params: noteIdInput, response: noteSchema }, scopes: ['notes:read'] }, (ctx, _body, params) =>
      this.call<NoteDto>(ctx, 'notes.get', params),
    );
    this.get('/public/stats', { auth: false, rateLimit: { windowMs: 60_000, maxRequests: 30 } }, async () => stats());
  }
}
```

- `schema.body`, `params` and `query` are parsed before the handler runs; the handler receives the
  parsed (typed) values. Failures return 400 with the issues in `error.details`.
- `schema.response` is validated on the way out (`validateResponses: true` by default), so a handler
  can't leak fields the contract doesn't declare. It also documents the route in OpenAPI.
- Return a value for 200 (or `status`), `undefined` for 204, or `httpResponse(status, body, headers)`
  for full control.
- Route options: `auth` (strategy, list, or `false`), `scopes` (all required), `rateLimit` (rule or
  `false`), `status`, `summary`, `description`, `tags`, `deprecated`, `bodyLimitBytes`.
- Duplicate `method + path` throws `api/duplicate-route` at registration.

## Rate limits

`withRateLimit` applies `default` to authenticated callers and `anonymous` (default: `default`) to
anonymous callers keyed by IP. `forTenant(tenantId)` returns per-plan overrides. Responses carry
`RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds); over the limit the request
fails with 429. If the limiter backend errors, requests are allowed (`failOpen`, default true) and the
error is logged.

Each rule picks an `algorithm`:

| Algorithm | Behavior | Use for |
| --- | --- | --- |
| `sliding-window` (default) | Exact count over the last `windowMs`. One sorted-set entry per request. | Public APIs where bursts at window edges matter. |
| `fixed-window` | One counter per window; up to 2× the limit across a boundary. Cheapest. | High-volume, coarse limits. |
| `token-bucket` | `maxRequests` tokens refilled evenly over `windowMs`; bursts up to the bucket size. | Smooth per-client throughput. |

`cost` weights a request (an export can cost 10). The Redis limiter runs each check as one Lua
script using Redis server time, so every instance shares one budget whatever its clock says.

For quotas outside HTTP (jobs, AI calls, exports), use `DefaultRateLimiting` from
`@mariachi/rate-limit` with named tiers:

```ts
const limits = new DefaultRateLimiting({
  limiter,
  resolveTier: async (ctx) => (await plans.forTenant(ctx.tenantId!))?.rateTier,   // undefined → 'default'
}, instrumentation);
const tiers = {
  default: { name: 'default', rule: { algorithm: 'token-bucket', maxRequests: 60, windowMs: 60_000 } },
  pro: { name: 'pro', rule: { algorithm: 'token-bucket', maxRequests: 600, windowMs: 60_000 } },
};
await limits.consumeTier(ctx, 'ai.chat', tiers);   // throws rate-limit/exceeded (429) with retryAfterSeconds
```

Each tenant has its own counter per action. A tier name that doesn't exist is an error
(`rate-limit/unknown-tier`), not a silent fallback. A backend failure is `rate-limit/backend-failed`
(503).

## Context and tracing

Each request gets a `Context` built from the resolved identity. `traceId` comes from the W3C
`traceparent` header when present, otherwise from the request id (`x-request-id`, echoed back). With
a `tracer`, every request runs inside an `http.request` span tagged with method and route.

## Webhooks

```ts
class StripeAuth extends SignatureAuthController {
  readonly provider = 'stripe';
  readonly signatureHeader = 'stripe-signature';
  protected async verifySignature(signature: string, rawBody: Buffer) {
    return verifyStripeSignature(signature, rawBody, secret); // constant-time compare
  }
}

class StripeWebhooks extends WebhookController {
  readonly prefix = 'stripe';
  readonly auth = new StripeAuth();
  init(): void {
    // queue mode: acknowledge with 202 fast, process in a job (retries, DLQ)
    this.post('/events', { mode: 'queue', jobName: 'stripe-event' }, async (_ctx, body) => body);
  }
}

const webhooks = new WebhookServer({ name: 'webhooks' }, { jobQueue: queue, communication, idempotency, logStore })
  .registerController(new StripeWebhooks());
```

The handler's return value is the procedure input (`mode: 'direct'`) or the job payload
(`mode: 'queue'`). With an `idempotency` store and a provider event id, redeliveries return
`200 { duplicate: true }` without reprocessing. Signature checks always run over the exact raw bytes;
a route with no raw body is rejected. See [recipes/add-webhook-endpoint.md](./recipes/add-webhook-endpoint.md).

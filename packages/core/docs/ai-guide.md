# Guide for coding agents

Read [architecture.md](./architecture.md) and [conventions.md](./conventions.md) first. This page
answers "which piece do I use?" and lists the mistakes agents most often make. Run `mariachi validate`
and `tsc --noEmit` before you finish.

## Which piece?

| I need to... | Use | Start with |
| --- | --- | --- |
| Add a resource with CRUD endpoints | table + repository + service + handler + controller | `mariachi generate entity <name>`, [recipe](./recipes/add-domain-entity.md) |
| Add business logic callable from HTTP | service + handler (`communication.register`) | `mariachi generate service <name>` |
| Expose a procedure over HTTP | `BaseController` calling `this.call(ctx, name, input)` | `mariachi generate controller <name>`, [http.md](./http.md) |
| Do work later, with retries, or on a cron | `defineJob` + `jobs.enqueue(ctx, ...)` / `jobs.schedule` | `mariachi generate job <name>`, [jobs.md](./jobs.md) |
| Tell other modules something happened | `defineEvent` + `events.publish(ctx, ...)` / `subscribe` | [events.md](./events.md) |
| Publish an event atomically with a DB write | transactional outbox | [events.md](./events.md#transactional-outbox) |
| Receive a signed callback from a provider | `WebhookController` + `SignatureAuthController` | [recipe](./recipes/add-webhook-endpoint.md) |
| Call a third-party API | typed client with retry + `IntegrationError` | `mariachi generate integration <name>` |
| Push live updates to browsers | `DefaultRealtime` + `WSAdapter` | [realtime.md](./realtime.md) |
| Cache or lock | `DefaultCache.getOrSet`, `createLock().withLock` | below |
| Change the database | edit `src/schema/*`, then `mariachi db generate` | [cli.md](./cli.md#db) |
| Read a setting or secret | `useConfig()` / `createSecrets()` | never `process.env` |
| Take payments or check a plan | `DefaultBilling` + Stripe webhooks | [billing.md](./billing.md) |
| Email, SMS, push or in-app messages | `notifications.notify(ctx, intent)` | [notifications.md](./notifications.md) |
| Call an LLM | `DefaultAI` sessions | [ai.md](./ai.md) |
| Record who did what | `audit.log(ctx, ...)` on `DrizzleAuditLog` | [audit.md](./audit.md) |
| Check a permission | `rbac.can(identity, action, resource)` | [auth-and-providers.md](./auth-and-providers.md#authorization-rbac) |
| Turn a feature on per tenant | `createFeatureFlags` + `DrizzleFeatureFlagStore` | [feature-flags.md](./feature-flags.md) |
| Store or serve files | `DefaultStorage` | [storage.md](./storage.md) |
| Full-text search | `DefaultSearch` on Typesense | [search.md](./search.md) |
| Limit a tenant's usage outside HTTP | `DefaultRateLimiting.consumeTier` | [http.md](./http.md#rate-limits) |
| Test without infrastructure | `@mariachi/testing` doubles | [testing.md](./testing.md) |

## Cheat sheet

```ts
// Procedure: register in the service layer (src/services/<d>/<d>.handler.ts)
communication.register('orders.create', {
  schema: { input: createOrderInput, output: orderSchema },
  handler: (ctx, input) => service.create(ctx, input),
});

// Procedure: call from a controller. ctx first, then name, then input.
this.post('/', { schema: { body: createOrderInput, response: orderSchema }, status: 201 }, (ctx, body) =>
  this.call<OrderDto>(ctx, 'orders.create', body),
);

// Repository
class OrdersRepository extends DrizzleRepository<Order> {
  constructor(db: DrizzleDb) { super(ordersTable, db); }
}
await orders.getById(ctx, id);                              // NotFoundError if missing or another tenant's
await orders.paginateCursor(ctx, { limit: 20, cursor });    // { data, nextCursor, hasMore }
await withTransaction(db, ctx, async () => { /* repositories join the transaction */ });

// Jobs
await jobs.enqueue(ctx, 'send-digest', { userId });
await jobs.enqueueWithDedup(ctx, 'send-digest', { userId }, `digest:${userId}`);

// Events
await events.publish(ctx, orderPlaced, { orderId });
events.subscribe(orderPlaced, async (ctx, payload, meta) => { /* idempotent on meta.id */ }, { group: 'billing' });

// Cache (DefaultCache over createCache(...) + createLock(...))
const user = await cache.getOrSet(ctx, cache.key('users', id), () => users.getById(ctx, id), 300);
await lock.withLock(`invoice:${id}`, 30_000, async () => { /* one instance at a time; lock = createLock(...) */ });

// Errors
throw new NotFoundError('order', id);
throw new ConflictError('orders/already-paid', 'Paid orders cannot be cancelled');
throw new ValidationError('Invalid date range', [{ path: ['to'], message: 'must be after from' }]);
```

## Gotchas

1. **Argument order is `(ctx, ...)` everywhere**, including `communication.call(ctx, name, input)`,
   job handlers `(ctx, data)` and event handlers `(ctx, payload, meta)`. Old examples with `ctx`
   second are wrong.
2. **Create one communication layer per process** and pass it around. A second `createCommunication()`
   has no handlers, so calls fail with `communication/not-found`.
3. **Registering a procedure name twice throws** at startup (`communication/duplicate-procedure`).
4. **Tenant-scoped tables need `ctx.tenantId`.** Repositories throw `database/tenant-required`
   without it. Background work across tenants must call `repository.crossTenant()` explicitly.
5. **Reads hide soft-deleted rows.** Pass `{ withDeleted: true }` to see them; `hardDelete` really
   deletes.
6. **Output schemas strip fields.** If a field is missing from a response, add it to the contract's
   output schema; don't loosen validation.
7. **At-least-once means duplicates.** Job handlers, event subscribers and webhook processors must be
   idempotent (`runOnce`, unique constraints, or upserts).
8. **Enqueue or publish after commit**, or use the outbox. Inside a transaction, a job can run before
   the row is visible.
9. **Only worker processes call `jobs.start()`**, and they must register every schedule: `start()`
   removes schedules it doesn't know.
10. **Memory adapters are for tests.** `createJobQueue({ adapter: 'memory' })`,
    `createEventBus({ adapter: 'memory' })` and `createCache({ adapter: 'memory' })` share nothing
    across processes.
11. **Keep the `// mariachi:*` marker comments** in registry files; generators insert above them.
12. **Packages marked alpha in [packages.md](./packages.md)** are still being hardened. Check their
    README and tests before relying on an API.
13. **Pass your own idempotency key for money movement.** `billing.charge`, `refund`, `subscribe` and
    `grantCredits` generate a key when you omit it, but that key is new on every call, so a retried
    request charges twice. Use something stable: `order:${id}`.
14. **Webhook handlers need the raw body.** Stripe, Slack and auth providers sign the exact bytes; use
    `ctx.request.rawBody` or the webhooks package, never `JSON.stringify(body)`.
15. **Email template values are escaped; `{{{raw}}}` is not.** Never put user input in a triple-brace
    placeholder.
16. **Search isn't tenant-scoped.** Index `tenantId` and filter on it in every query.
17. **Doubles must pass the contract suites.** When you change a real adapter's behavior, update the
    suite in `packages/testing/src/contracts/` so the double is forced to match.

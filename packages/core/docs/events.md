# Events

Events say "this happened" to whoever cares, in this process or another. Use them for reactions that
the publisher shouldn't know about (send a welcome email when a user signs up). Use a procedure call
when you need an answer, and a job when the work must happen at a specific time or with a specific
retry policy.

## Define, publish, subscribe

```ts
import { createEventBus, DefaultEvents, defineEvent } from '@mariachi/events';

export const userSignedUp = defineEvent('users.user.signed-up', {
  schema: z.object({ userId: z.string().uuid(), email: z.string().email() }),
});

const bus = lifecycle.manage('event-bus', createEventBus({ adapter: 'redis-streams', url: config.redis.url }));
const events = new DefaultEvents({ bus, source: 'api' }, instrumentation);

await events.publish(ctx, userSignedUp, { userId, email });   // validated against the schema

events.subscribe(userSignedUp, async (ctx, payload, meta) => {
  await mailer.sendWelcome(ctx, payload.email);                // ctx has the publisher's tenant and trace
}, { group: 'mailer' });
```

Every event travels as an envelope: `{ id, type, payload, occurredAt, traceId, tenantId, userId,
identityType, source }`. Subscribers get a `Context` rebuilt from it, so logs and repositories on the
consumer side see the publisher's tenant and trace. `meta` carries `id`, `attempt` and `source`.

## Groups

- **With `group`**: each event is delivered to one subscriber in the group, across all instances
  (competing consumers). Use it for work that must happen once, like sending an email.
- **Without `group`**: every instance receives every event (fanout). Use it for cache invalidation or
  pushing to local WebSocket connections.

## Choosing a transport

| Adapter | Guarantee | Offline consumers | Use for |
| --- | --- | --- | --- |
| `memory` | in-process | n/a | tests, single-process dev |
| `redis` (pub/sub) | at-most-once | miss events | fanout of ephemeral signals |
| `redis-streams` | at-least-once | catch up from the stream | default for domain events on Redis |
| `nats` (core) | at-most-once | miss events | low-latency fanout |
| `nats-jetstream` | at-least-once | durable consumer per group | domain events on NATS |

`events.guarantee` reports the bus's guarantee. With at-least-once transports, handlers **will** see
duplicates (redelivery after a crash or a slow ack), so make them idempotent: key side effects on
`meta.id` with `runOnce`.

Redis Streams details: one stream per event type (`<prefix>:<event>`), one consumer group per
subscription group, pending entries from dead consumers reclaimed after `claimIdleMs` (30s), and
entries delivered `maxDeliveries` times (10) moved to `<prefix>:dead-letter`. JetStream details: a group
becomes a durable consumer; fanout subscriptions use ephemeral consumers that only see new messages;
publishes use the envelope id as `msgID`, so broker-side dedup applies.

## Retries and dead letters

A failing handler is retried in-process with core `retry` (default 3 attempts, exponential from
100ms). Errors whose `code` is `validation/invalid-input` or listed in `nonRetryableCodes` aren't
retried. After the last attempt the envelope, subscriber and error go to the `deadLetter` sink
(default: logged at error level; `RedisStreamDeadLetterSink` for replay). If the sink itself fails, the
error propagates so an at-least-once transport redelivers. Override `onHandlerError(ctx, envelope,
error)` in a subclass to alert.

## Transactional outbox

Publishing after a database commit can lose the event if the process dies in between; publishing
before the commit can announce something that was rolled back. The outbox writes the event in the same
transaction as the data, and a relay publishes it afterwards.

```ts
import { Outbox, OutboxRelay } from '@mariachi/events/outbox';

// src/schema/index.ts, so `mariachi db generate` creates mariachi_event_outbox:
//   export { eventOutboxTable } from '@mariachi/events/outbox';

const outbox = new Outbox(database.db, { source: 'api' });
await withTransaction(database.db, ctx, async () => {
  await orders.create(ctx, order);
  await outbox.add(ctx, orderPlaced, { orderId: order.id }); // throws outside a transaction
});

lifecycle.manage('outbox-relay', new OutboxRelay({ db: database.db, target: events, logger }));
```

The relay claims batches with `FOR UPDATE SKIP LOCKED`, so several instances can run it. Failed publishes
back off exponentially (up to `maxBackoffMs`, 5 minutes), and published rows are purged after
`retentionMs` (7 days). Delivery is at-least-once, because the relay can crash after publishing and
before marking the row. Consumers dedup on the envelope id, which is stable across retries.

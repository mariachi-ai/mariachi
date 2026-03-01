# Notifications, Realtime, and NATS

> **Date:** 2026-02-24
> **Status:** Draft
> **Scope:** `@mariachi/events`, `@mariachi/notifications`, `@mariachi/realtime` (new)

---

## Problem

The current architecture has unclear boundaries between three distinct concerns:

1. **Internal domain events** — service-to-service messaging (`@mariachi/events`, Redis Pub/Sub only)
2. **Transactional notifications** — user-facing messages (`@mariachi/notifications`, email only, no queue, no multi-channel)
3. **Realtime delivery** — pushing state to connected clients (does not exist)

There is no way to push updates to a connected browser. Transactional notifications are fire-and-forget with no retry. The event bus has no durable delivery option and no way to expose topics to authenticated clients.

---

## Architecture

```
                         ┌─────────────────────────────────┐
                         │        NATS Server               │
                         │  (subjects, JetStream, auth)     │
                         └──────────┬──────────┬────────────┘
                                    │          │
                    ┌───────────────┘          └───────────────┐
                    │                                          │
         ┌──────────▼──────────┐                   ┌───────────▼──────────┐
         │  @mariachi/events   │                   │  @mariachi/realtime  │
         │  (internal pub/sub) │                   │  (client-facing)     │
         │                     │                   │                      │
         │  Adapters:          │                   │  WebSocket / SSE     │
         │  - Redis Pub/Sub    │                   │  NATS bridge         │
         │  - NATS             │◄──────────────────│  Auth via facade     │
         │  - NATS JetStream   │   subscribes to   │  Presence tracking   │
         │    (durable)        │   internal events  │  Channel management  │
         └──────────┬──────────┘                   └──────────────────────┘
                    │                                          ▲
                    │  events trigger                           │
                    │  notifications                            │ pushes to
                    ▼                                          │ connected clients
         ┌──────────────────────────────────┐                  │
         │  @mariachi/notifications          │                  │
         │  (transactional, multi-channel)   │                  │
         │                                   │                  │
         │  1. Receive notification intent   │                  │
         │  2. Check user preferences (DB)   │                  │
         │  3. Enqueue via @mariachi/jobs    │                  │
         │  4. Deliver via channel:          │                  │
         │     - Email (Resend)              │                  │
         │     - SMS (Twilio)                │                  │
         │     - Push (FCM)                  │                  │
         │     - In-App (DB write) ──────────┼──────────────────┘
         └──────────────────────────────────┘
```

---

## 1. @mariachi/events — Add NATS Adapter

### What changes

Add two new adapters alongside the existing Redis Pub/Sub:

| Adapter | Use Case | Delivery |
|---|---|---|
| `RedisEventBusAdapter` | Existing, simple pub/sub | At-most-once |
| `NATSEventBusAdapter` | High-throughput internal messaging | At-most-once |
| `NATSJetStreamAdapter` | Durable event streaming with replay | At-least-once |

### NATS Adapter

```ts
import { connect, type NatsConnection, StringCodec } from 'nats';

export class NATSEventBusAdapter implements EventBus {
  private connection: NatsConnection | null = null;
  private readonly sc = StringCodec();

  constructor(private readonly config: { servers: string | string[]; prefix?: string }) {}

  async connect(): Promise<void> {
    this.connection = await connect({ servers: this.config.servers });
  }

  async publish<T>(eventName: string, payload: T): Promise<void> {
    const subject = this.subject(eventName);
    this.connection!.publish(subject, this.sc.encode(JSON.stringify(payload)));
  }

  subscribe<T>(eventName: string, handler: EventHandler<T>): void {
    const subject = this.subject(eventName);
    const sub = this.connection!.subscribe(subject);
    (async () => {
      for await (const msg of sub) {
        const payload = JSON.parse(this.sc.decode(msg.data)) as T;
        await handler(payload);
      }
    })();
  }

  async disconnect(): Promise<void> {
    await this.connection?.drain();
  }

  private subject(eventName: string): string {
    return this.config.prefix ? `${this.config.prefix}.${eventName}` : eventName;
  }
}
```

### NATS JetStream Adapter (durable)

For events that must not be lost (billing webhooks, audit events, notification triggers):

```ts
export class NATSJetStreamAdapter implements EventBus {
  // Uses JetStream consumer groups for:
  // - At-least-once delivery
  // - Consumer replay (new subscribers get historical events)
  // - Acknowledgment tracking
  // - Dead letter on max retry
}
```

### Dependencies

- `nats` — the official NATS.js client (works in Node.js and Bun)

### Config changes

```ts
interface EventBusConfig {
  adapter: 'redis' | 'nats' | 'nats-jetstream';
  url?: string;        // Redis URL or NATS server(s)
  servers?: string[];   // NATS server list
  prefix?: string;
  jetstream?: {
    stream: string;     // JetStream stream name
    durableName?: string;
  };
}
```

---

## 2. @mariachi/notifications — Transactional Multi-Channel Router

### What changes

The `Notifications` abstract class becomes a **multi-channel notification router** that:

1. Accepts a notification intent (who, what, through which channels)
2. Resolves user delivery preferences from the DB
3. Enqueues each channel delivery as a job via `@mariachi/jobs`
4. Each job invokes the appropriate channel adapter
5. Records delivery status in the DB

### New types

```ts
interface NotificationIntent {
  recipientUserId: string;
  recipientTenantId: string;
  category: string;                    // 'billing', 'security', 'social', etc.
  template: NotificationTemplate;
  variables: Record<string, string>;
  channels?: NotificationChannel[];     // Override user prefs; if omitted, resolve from DB
  priority?: 'critical' | 'high' | 'normal' | 'low';
  idempotencyKey?: string;
}

type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';

interface DeliveryRecord {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced';
  externalId?: string;                  // Resend message ID, Twilio SID, etc.
  error?: string;
  attemptCount: number;
  sentAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
}
```

### New abstract class shape

```ts
abstract class Notifications implements Instrumentable {
  // Adapters
  protected readonly email: EmailAdapter;
  protected readonly sms?: SMSAdapter;
  protected readonly push?: PushAdapter;
  protected readonly inApp: InAppNotificationStore;
  protected readonly preferences: NotificationPreferencesStore;
  protected readonly jobs: JobQueue;

  // Core method: route notification through appropriate channels
  async notify(ctx: Context, intent: NotificationIntent): Promise<string> {
    // 1. Resolve channels (from intent override or user preferences)
    // 2. Render template for each channel
    // 3. Enqueue a delivery job per channel via @mariachi/jobs
    // 4. Write notification record to DB
    // 5. Return notification ID
  }

  // Direct send methods (used by job workers, not typically by app code)
  async sendEmail(ctx: Context, message: EmailMessage): Promise<{ id: string }> { ... }
  async sendSMS(ctx: Context, to: string, body: string): Promise<{ id: string }> { ... }
  async sendPush(ctx: Context, token: string, title: string, body: string): Promise<{ id: string }> { ... }
  async sendInApp(ctx: Context, notification: InAppNotification): Promise<InAppNotification> { ... }

  // Hooks
  protected onNotificationSent?(ctx: Context, channel: NotificationChannel, recipientId: string): Promise<void>;
  protected onNotificationFailed?(ctx: Context, channel: NotificationChannel, error: Error): Promise<void>;
}
```

### Job-based delivery

Every notification delivery goes through `@mariachi/jobs`:

```ts
// Defined as a job:
defineJob({
  name: 'notifications.deliver',
  schema: z.object({
    notificationId: z.string(),
    channel: z.enum(['email', 'sms', 'push', 'in_app']),
    recipientUserId: z.string(),
    renderedSubject: z.string(),
    renderedBody: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
  retry: { attempts: 3, backoff: 'exponential', delay: 5000 },
  handler: async (data, ctx) => {
    const notifications = getContainer().resolve<Notifications>(KEYS.Notifications);
    // Route to the appropriate send method based on channel
  },
});
```

This guarantees:
- Retry on transient failures (email API down, push token expired)
- No lost notifications (job persists in Redis/BullMQ)
- Backpressure (queue doesn't overwhelm email API rate limits)
- Observability (job metrics show delivery latency, failure rate)

### New DB schemas

Add to `packages/notifications/src/schema/`:

```
notification_deliveries {
  id                uuid PK
  notification_id   uuid NOT NULL
  tenant_id         text NOT NULL
  user_id           text NOT NULL
  channel           text NOT NULL       -- 'email' | 'sms' | 'push' | 'in_app'
  status            text NOT NULL       -- 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced'
  external_id       text               -- provider message ID
  error             text
  attempt_count     integer NOT NULL DEFAULT 0
  sent_at           timestamp
  delivered_at      timestamp
  created_at        timestamp NOT NULL
}
```

### New adapter interfaces

```ts
interface SMSAdapter {
  send(to: string, body: string): Promise<{ id: string }>;
}

interface PushAdapter {
  send(token: string, title: string, body: string, data?: Record<string, string>): Promise<{ id: string }>;
}
```

---

## 3. @mariachi/realtime — New Package

### Purpose

A WebSocket/SSE server that bridges internal events to authenticated browser/mobile clients. Acts as a NATS-to-WebSocket proxy with the API facade's auth layer.

### How it works

1. Client connects via WebSocket and sends an auth token (JWT or session)
2. Realtime server verifies the token using `@mariachi/auth`
3. Client subscribes to channels (e.g., `notifications:{userId}`, `chat:room-123`)
4. Server authorizes channel access using `@mariachi/auth` (RBAC)
5. Server subscribes to the corresponding NATS subjects on behalf of the client
6. When NATS receives a message on that subject, server pushes it to the WebSocket

### Architecture

```ts
interface RealtimeConfig {
  auth: AuthenticationAdapter;
  authorization?: AuthorizationAdapter;
  events: EventBus;                     // NATS-backed event bus
  port?: number;
  path?: string;                        // default: /ws
  heartbeatIntervalMs?: number;
  maxConnectionsPerUser?: number;
}

abstract class Realtime implements Instrumentable {
  // Connection lifecycle
  async handleConnection(socket: WebSocket, token: string): Promise<void>;
  async handleDisconnection(connectionId: string): Promise<void>;

  // Channel management
  async subscribeToChannel(ctx: Context, connectionId: string, channel: string): Promise<boolean>;
  async unsubscribeFromChannel(ctx: Context, connectionId: string, channel: string): Promise<void>;

  // Broadcast (used by internal services)
  async broadcast(ctx: Context, channel: string, payload: unknown): Promise<void>;
  async sendToUser(ctx: Context, userId: string, payload: unknown): Promise<void>;

  // Presence
  async getOnlineUsers(channel?: string): Promise<string[]>;
  async isUserOnline(userId: string): Promise<boolean>;

  // Hooks
  protected onClientConnected?(ctx: Context, userId: string): Promise<void>;
  protected onClientDisconnected?(ctx: Context, userId: string): Promise<void>;
  protected onChannelSubscribed?(ctx: Context, userId: string, channel: string): Promise<void>;
}
```

### Connection state

Stored in Redis (not in-memory — must work across pods):

```
realtime:connections:{connectionId}  → { userId, tenantId, connectedAt, channels[] }
realtime:users:{userId}:connections  → Set<connectionId>
realtime:channels:{channel}:members  → Set<connectionId>
realtime:presence:{userId}           → { lastSeen, status }
```

### Client protocol (WebSocket messages)

```ts
// Client → Server
{ type: 'subscribe', channel: 'notifications:user-123' }
{ type: 'unsubscribe', channel: 'notifications:user-123' }
{ type: 'ping' }

// Server → Client
{ type: 'message', channel: 'notifications:user-123', data: { ... } }
{ type: 'subscribed', channel: 'notifications:user-123' }
{ type: 'unsubscribed', channel: 'notifications:user-123' }
{ type: 'error', code: 'auth/forbidden', message: 'Not authorized for this channel' }
{ type: 'pong' }
```

### Auth flow

```
Client                    Realtime Server              Auth              NATS
  │                            │                        │                 │
  ├─ WS connect + JWT ────────►│                        │                 │
  │                            ├─ verify(token) ────────►│                │
  │                            │◄─ ResolvedIdentity ────┤                 │
  │                            │                        │                 │
  ├─ subscribe(channel) ──────►│                        │                 │
  │                            ├─ can(user, sub, chan) ─►│                 │
  │                            │◄─ true ────────────────┤                 │
  │                            ├─ NATS subscribe(chan) ──────────────────►│
  │                            │                        │                 │
  │                            │◄─── message on chan ────────────────────┤
  │◄─ WS message ─────────────┤                        │                 │
```

### Dependencies

- `ws` — WebSocket server
- `nats` — subscribe to NATS subjects on behalf of clients
- `@mariachi/auth` — token verification and channel authorization
- `@mariachi/cache` — Redis for connection state, presence

### Adapters

| Adapter | Transport | Use case |
|---|---|---|
| `WSRealtimeAdapter` | `ws` library | Standard WebSocket |
| `SSERealtimeAdapter` | Server-Sent Events | One-way push, simpler for notifications-only |
| `SocketIORealtimeAdapter` | Socket.IO | If you need rooms, auto-reconnect, fallback |

---

## 4. How Notifications + Realtime Connect

When a transactional in-app notification is created:

1. `Notifications.notify(ctx, intent)` writes to `notifications` DB table
2. Enqueues `notifications.deliver` job with `channel: 'in_app'`
3. Job worker writes to DB and then calls `Realtime.sendToUser(ctx, userId, notificationPayload)`
4. Realtime looks up the user's active connections in Redis
5. Pushes via WebSocket to all connected clients

If the user is offline, the notification sits in the DB. When they reconnect, the client fetches unread notifications via a REST endpoint.

---

## 5. NATS Subject Naming Convention

Standardize subject names across the framework:

```
mariachi.events.{domain}.{action}           — internal domain events
  e.g., mariachi.events.billing.subscription.created
  e.g., mariachi.events.users.profile.updated

mariachi.notifications.{userId}              — user notification channel
  e.g., mariachi.notifications.user-abc-123

mariachi.realtime.{channel}                  — realtime channels
  e.g., mariachi.realtime.chat.room-456
  e.g., mariachi.realtime.presence.online
```

---

## Summary of Changes

| Package | Change |
|---|---|
| `@mariachi/events` | Add `NATSEventBusAdapter` + `NATSJetStreamAdapter`, update factory, add `nats` dep |
| `@mariachi/notifications` | Rewrite as multi-channel router. Add `notify()` method, SMS/Push adapters, job-based delivery, delivery tracking DB schema, user preference resolution |
| `@mariachi/realtime` | **New package.** WebSocket/SSE server, NATS bridge, auth integration, presence, channel management. Redis-backed connection state |
| `@mariachi/jobs` | Add notification delivery job definition |
| `@mariachi/auth` | Channel authorization support (can user subscribe to this realtime channel?) |

### Implementation order

1. `@mariachi/events` — add NATS adapter (no breaking changes)
2. `@mariachi/notifications` — rewrite with multi-channel routing + job queue delivery
3. `@mariachi/realtime` — new package, depends on events + auth + cache
4. Wire in-app notifications → realtime push
5. Add NATS subject naming convention enforcement to `@mariachi/create` validator

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
         │    (durable)        │   internal events  │  Channel management   │
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

---

For full design details (NATS adapter code, notification types, realtime API, client protocol), see the framework repository's `docs/improvements/` or the source ADR.

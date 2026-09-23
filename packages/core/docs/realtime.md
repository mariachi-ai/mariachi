# Realtime

WebSockets for pushing live updates. `DefaultRealtime` holds connections, channels and presence;
`WSAdapter` speaks the protocol over `ws`. With the Redis backplane, any instance can deliver to a
connection held by any other instance.

## Wiring

```ts
import { createRealtimeInfra, DefaultRealtime, WSAdapter } from '@mariachi/realtime';

const { backplane, presence } = createRealtimeInfra({ adapter: 'redis', url: config.redis.url });
const realtime = lifecycle.manage(
  'realtime',
  new DefaultRealtime({ backplane, presence, config: { maxConnectionsPerUser: 10 } }, instrumentation),
);
lifecycle.manage(
  'realtime-ws',
  new WSAdapter(realtime, {
    port: 3003,                                   // or `server: httpServer` to share a port
    path: '/ws',
    allowedOrigins: ['https://app.example.com'],
    authenticate: async (token) => {              // Authorization: Bearer <token>, or ?token=
      if (!token) return null;
      const id = await jwt.verify(token);
      return { userId: id.userId, tenantId: id.tenantId, scopes: id.scopes };
    },
  }),
  { priority: 110 },
);
```

The HTTP upgrade is rejected before a socket exists: 401 when `authenticate` returns `null`, 403 for
a disallowed origin, 404 for another path. Frames are capped at `maxPayloadBytes` (64 KiB).

## Channels and authorization

Clients can subscribe only to channels the `ChannelAuthorizer` allows. The default policy:

| Channel | Subscribe | Client publish |
| --- | --- | --- |
| `public:<name>` | anyone authenticated | no |
| `tenant:<tenantId>[:...]` | members of that tenant | if `allowClientPublish` |
| `user:<userId>` | that user only | if `allowClientPublish` |
| anything else | denied | denied |

Pass `authorize: (identity, channel, action) => boolean | Promise<boolean>` to replace it.
`allowClientPublish` is off by default, so clients only receive. When it's on, `onClientPublish` can
validate or transform the data, and the sender doesn't receive its own message.

## Sending from the server

```ts
await realtime.broadcast(ctx, `tenant:${ctx.tenantId}:orders`, { type: 'order.updated', id });
await realtime.sendToUser(ctx, userId, { type: 'notification', text });  // all of the user's connections, within ctx.tenantId
await realtime.getOnlineUsers(ctx);                                       // tenant-scoped
await realtime.isUserOnline(ctx, userId);
```

Delivery always goes through the backplane, so it reaches every instance. A typical source is an
event subscriber without a group, which runs on every instance.

## Protocol

Client → server (JSON): `{ type: 'subscribe' | 'unsubscribe', channel, id? }`,
`{ type: 'publish', channel, data, id? }`, `{ type: 'ping', id? }`.

Server → client: `welcome { connectionId }`, `subscribed` / `unsubscribed { channel, id }`,
`message { channel, data, from? }`, `published`, `pong`, `error { code, message, channel?, id? }`.

## Heartbeats, presence and limits

The server pings every `heartbeatIntervalMs` (30s) and terminates connections that don't answer
(close code 4000). Presence entries expire after `connectionTtlMs` (3 × heartbeat), so a crashed
instance's users drop off on their own. `maxConnectionsPerUser` is enforced across the cluster (close
4008), and `maxChannelsPerConnection` (100) caps subscriptions. On shutdown, sockets close with 1001
so clients reconnect to another instance.

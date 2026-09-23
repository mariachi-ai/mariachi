# Notifications

`@mariachi/notifications` sends one message to a user across email, SMS, push and an in-app inbox.
It respects the user's preferences, delivers each channel as its own retried job and records every
delivery.

## Wire it

```ts
import {
  DefaultNotifications, NOTIFICATION_DISPATCH_JOB, notificationJobSchema,
  TwilioSmsAdapter, FcmPushAdapter, createEmailAdapter,
} from '@mariachi/notifications';
import { DrizzleNotificationStore } from '@mariachi/notifications/postgres';

const store = new DrizzleNotificationStore(db);          // inbox, preferences and delivery log
const notifications = new DefaultNotifications({
  email: createEmailAdapter(config),                     // resend in production, smtp (Mailpit) locally
  sms: new TwilioSmsAdapter({ accountSid, authToken, from: '+15550100' }),
  push: new FcmPushAdapter({ projectId, accessToken: () => google.getAccessToken() }),
  inApp: store,
  preferences: store,
  deliveries: store,
  queue: jobs,                                           // a DefaultJobs; omit to send inline
}, instrumentation);

// Register in every process that enqueues or runs jobs; the retry policy lives here.
jobs.registerJob(defineJob({
  name: NOTIFICATION_DISPATCH_JOB,
  schema: notificationJobSchema,
  retry: { attempts: 5, backoff: 'exponential', delay: 2_000 },
  nonRetryableCodes: ['notifications/missing-recipient'],
  handler: (ctx, job) => notifications.deliverJob(ctx, job),
}));
```

Add the tables from `@mariachi/notifications/schema`. For local email, run Mailpit from
`docker-compose.dev.yml` and set `email.adapter: 'smtp'`.

## Send

```ts
await notifications.notify(ctx, {
  recipientUserId: user.id,
  recipientTenantId: org.id,
  category: 'billing',                        // preferences are per category
  template: { id: 'invoice', name: 'Invoice ready', channel: 'email',
              subject: 'Invoice {{number}} is ready', body: '<p>Hi {{name}}, your invoice is ready.</p>' },
  variables: { name: user.name, number: invoice.number },
  email: user.email, phone: user.phone, pushToken: device.token,
  idempotencyKey: `invoice:${invoice.id}`,    // dedup key for the queued jobs
});
```

Templates use `{{name}}` placeholders. In email bodies, values are HTML-escaped, so a user's
display name can't inject markup. Use `{{{name}}}` only for HTML you built yourself. Subjects never
contain line breaks. SMS, push and in-app bodies are plain text.

## Channels and preferences

- With `channels` omitted, the user's preferences for the category decide (default: `email` and
  `in_app`). An explicit empty list is a full opt-out.
- With `channels` given, they are filtered by the preferences.
- `priority: 'critical'` skips the preference filter (password resets, security alerts).

```ts
await store.setChannels(userId, tenantId, 'marketing', []);          // opt out of a category
await store.setChannels(userId, tenantId, 'billing', ['email', 'push']);
```

## Delivery and retries

With a `queue`, `notify` records each channel as `queued` and enqueues one
`notifications.dispatch` job per channel, carrying the caller's context. The job definition owns
the retries: `deliverJob` makes one attempt per run. Without a queue, channels are sent inline and
retried `attempts` times (default 3) with backoff. Either way:

- `notification_deliveries` holds one row per notification and channel, with its status
  (`queued`, `sent`, `delivered`, `failed`, `bounced`), `attemptCount`, provider id and last error.
- A channel already `sent` is skipped, so a redelivered job doesn't message the user twice.
- A missing recipient or an unconfigured channel fails immediately and isn't retried.
- Provider callbacks (Twilio status, email bounces) update the row with
  `store.updateByExternalId(providerId, { status: 'delivered', deliveredAt })`.

## Inbox

```ts
await store.findUnread(ctx.userId!, ctx.tenantId);
await store.markRead(notificationId, ctx.userId!);   // only the recipient can mark it read
await store.markAllRead(ctx.userId!, ctx.tenantId);
```

## Errors

Everything throws `NotificationError`: `notifications/missing-recipient`,
`notifications/*-not-configured`, `notifications/email-send-failed`, `notifications/sms-send-failed`,
`notifications/push-send-failed`, `notifications/provider-failed` and configuration codes such as
`notifications/missing-api-key`.

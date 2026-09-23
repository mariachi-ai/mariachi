# Recipe: add a webhook endpoint

Goal: receive GitHub `push` deliveries, verify their signature, acknowledge fast, and process them in a
job with retries.

```
POST /webhooks/github/events
  → WebhookServer: raw body captured, request logged (secrets redacted)
  → SignatureAuthController: HMAC over the raw bytes, constant-time compare
  → dedup on the delivery id (idempotency store)
  → route handler: returns the payload
  → mode 'queue': enqueue job, respond 202    |    mode 'direct': communication.call(procedure), respond 200
```

Prefer `queue` mode for anything slower than a few hundred milliseconds or anything that calls other
APIs. Providers time out and retry quickly; the job gives you your own retries and a dead-letter queue.

## 1. Verify the signature: `src/webhooks/github.auth.ts`

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SignatureAuthController } from '@mariachi/webhooks';

export class GitHubWebhookAuth extends SignatureAuthController {
  readonly provider = 'github';
  readonly signatureHeader = 'x-hub-signature-256';
  protected readonly eventIdHeader = 'x-github-delivery';   // enables dedup

  constructor(private readonly secret: string) {
    super();
  }

  protected async verifySignature(signature: string, rawBody: Buffer): Promise<boolean> {
    const expected = `sha256=${createHmac('sha256', this.secret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
```

Always verify over `rawBody`, never over re-serialized JSON: key order and whitespace change the bytes.
Override `resolveTenant(req)` if a delivery maps to a tenant (for example, from a path parameter). For
generic HMAC schemes, `hmacSignatureStrategy` in api-facade does the same thing without a class.
Provider packages ship ready-made controllers (`ClerkWebhookController`, `FusionAuthWebhookHandler`),
and billing verifies Stripe signatures itself.

## 2. Route: `src/webhooks/github.controller.ts`

```ts
import { WebhookController } from '@mariachi/webhooks';
import { GitHubWebhookAuth } from './github.auth';

export class GitHubWebhookController extends WebhookController {
  readonly prefix = 'github';

  constructor(readonly auth: GitHubWebhookAuth) {
    super();
  }

  init(): void {
    this.post('/events', { mode: 'queue', jobName: 'github-push', ttl: '30d' }, async (ctx, body) => {
      const event = pushEventSchema.parse(body);             // validate at the boundary
      return { repository: event.repository.full_name, commits: event.commits.length };
    });
  }
}
```

The handler's return value becomes the job payload (or the procedure input in `direct` mode). Set
`logPayload: false` on routes whose bodies carry personal data.

## 3. Job: `src/jobs/github-push.job.ts`

```ts
export const githubPushJob = defineJob({
  name: 'github-push',
  schema: z.object({ repository: z.string(), commits: z.number().int() }),
  retry: { attempts: 5, backoff: 'exponential', delay: 2_000 },
  handler: async (ctx, data) => { /* ... */ },
});
```

Register it in `src/jobs/index.ts` (`mariachi generate job github-push` does this). The job id is
derived from the provider's delivery id, so a redelivery that slips past the idempotency store still
doesn't enqueue twice.

## 4. Server: in `src/main.ts`

```ts
const jobBackend = createJobQueue({ adapter: 'bullmq', redisUrl: config.redis.url, prefix: config.serviceName }, logger);
const jobs = new DefaultJobs({ queue: jobBackend }, instrumentation);   // the generated main.ts already has this

const webhooks = new WebhookServer(
  { name: 'webhooks', prefix: '/webhooks', logger },
  {
    jobQueue: jobBackend,                               // queue mode
    communication,                                      // direct mode
    idempotency: new RedisIdempotencyStore(redis),      // dedup by provider + delivery id
  },
).registerController(new GitHubWebhookController(new GitHubWebhookAuth(secrets.GITHUB_WEBHOOK_SECRET)));

lifecycle.startup.register({ name: 'webhooks', priority: 100, fn: async () => void (await webhooks.listen(config.server.webhookPort)) });
lifecycle.shutdown.register({ name: 'webhooks', priority: 100, fn: () => webhooks.close() });
```

Run webhooks on their own port (`WEBHOOK_PORT`, default 3002) so API auth and rate limits don't apply to
them and they can be exposed separately. Add `logStore` (`RepositoryWebhookLogStore` over the
`webhookLogsTable` schema) to keep an audit trail of deliveries.

## 5. Test

Use `webhooks.inject({ method: 'POST', url: '/webhooks/github/events', headers, payload })` with a body
signed using the test secret. Assert:

- a valid signature returns 202 and enqueues exactly one job;
- a bad or missing signature returns 401;
- the same delivery id sent twice returns `{ duplicate: true }` the second time.

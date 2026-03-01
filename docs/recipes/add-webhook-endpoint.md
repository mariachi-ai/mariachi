# Recipe: Add a Webhook Endpoint

This walks through creating a webhook endpoint that receives callbacks from third-party services (e.g. Stripe, GitHub). Mariachi's `@mariachi/webhooks` package provides `WebhookController` with two processing modes: `direct` (synchronous via communication layer) and `queue` (asynchronous via job queue).

---

## Overview

```
Third-party POST → WebhookServer → AuthController.auth() → WebhookController handler
                                                            ├── mode: 'direct' → communication.call(procedure, payload)
                                                            └── mode: 'queue'  → jobQueue.enqueue(jobName, payload)
```

All webhooks are logged via `WebhookLogStore`.

---

## 1. Create an Auth Controller

Each webhook controller needs an `AuthController` that verifies the incoming request. Extend either `ApiKeyAuthController` or `OAuthAuthController`.

**File:** `apps/api/src/webhooks/github-auth.ts`

```ts
import type { RequestContext } from '@mariachi/server';
import { ApiKeyAuthController } from '@mariachi/webhooks';

export class GitHubWebhookAuth extends ApiKeyAuthController {
  readonly provider = 'github';
  protected readonly headerName = 'x-hub-signature-256';

  protected async verify(signature: string, ctx: RequestContext): Promise<boolean> {
    // Verify the HMAC signature against the webhook secret
    // return verifyGitHubSignature(signature, ctx);
    return signature.length > 0;
  }
}
```

**Auth controller types:**
- `ApiKeyAuthController` -- verifies a header value (default: `x-api-key`). Override `headerName` for custom headers.
- `OAuthAuthController` -- verifies a Bearer token (default: `authorization` header).
- Custom: extend `AuthController` directly and implement `auth(req, ctx)`.

**Reference:** `packages/webhooks/src/auth/api-key.ts`, `packages/webhooks/src/auth/oauth.ts`

---

## 2. Create the Webhook Controller

Extend `WebhookController` with a `prefix`, `auth`, and route definitions in `init()`.

**File:** `apps/api/src/webhooks/github.controller.ts`

```ts
import { WebhookController, type WebhookContext, type WebhookRouteOpts } from '@mariachi/webhooks';
import { GitHubWebhookAuth } from './github-auth';

export class GitHubWebhookController extends WebhookController {
  readonly prefix = 'github';
  readonly auth = new GitHubWebhookAuth();

  init() {
    // Direct mode: process synchronously via communication layer
    this.post(this.buildPath('push'), {
      mode: 'direct',
      procedure: 'github.handlePush',
      ttl: '30d',
    }, this.handlePush);

    // Queue mode: enqueue for async processing via job queue
    this.post(this.buildPath('issue'), {
      mode: 'queue',
      jobName: 'github.processIssue',
      ttl: '30d',
    }, this.handleIssue);
  }

  handlePush = async (ctx: WebhookContext, body: unknown) => {
    ctx.logger.info('Received GitHub push webhook');
    // Transform/validate the payload before it's sent to the procedure
    return body;
  };

  handleIssue = async (ctx: WebhookContext, body: unknown) => {
    ctx.logger.info('Received GitHub issue webhook');
    // Transform/validate the payload before it's enqueued
    return body;
  };
}
```

**Route options (`WebhookRouteOpts`):**

| Field | Required | Description |
|-------|----------|-------------|
| `mode` | Yes | `'direct'` (sync) or `'queue'` (async) |
| `procedure` | When `mode: 'direct'` | Communication procedure name (e.g. `'github.handlePush'`) |
| `jobName` | When `mode: 'queue'` | Job name for `@mariachi/jobs` (e.g. `'github.processIssue'`) |
| `ttl` | No | Log retention duration (e.g. `'7d'`, `'30d'`). Defaults to server config `defaultTtl`. |

**Handler signature:** `(ctx: WebhookContext, body: unknown, params: Record<string, string>, query: Record<string, string>) => Promise<unknown>`

The return value becomes the payload sent to the communication procedure or job queue.

---

## 3. Register on a WebhookServer

The `WebhookServer` needs communication, job queue, and log store dependencies.

**File:** `apps/api/src/index.ts` (add to existing)

```ts
import { WebhookServer } from '@mariachi/webhooks';
import { GitHubWebhookController } from './webhooks/github.controller';

const webhookServer = new WebhookServer(
  { name: 'webhooks', defaultTtl: '7d' },
  { communication, jobQueue, logStore },
);

webhookServer.registerController(new GitHubWebhookController());

startup.register({
  name: 'webhook-server',
  priority: 100,
  fn: async () => {
    await webhookServer.listen(WEBHOOK_PORT);
  },
});

shutdown.register({
  name: 'webhook-server',
  priority: 100,
  fn: async () => {
    await webhookServer.close();
  },
});
```

---

## 4. Register the Handler or Job

**For `mode: 'direct'`** -- register a communication handler in `apps/services`:

```ts
communication.register('github.handlePush', {
  schema: { input: GitHubPushInput, output: z.object({ ok: z.boolean() }) },
  handler: async (ctx, input) => {
    // process the push event
    return { ok: true };
  },
});
```

**For `mode: 'queue'`** -- register a job in `apps/worker`:

```ts
export const ProcessGitHubIssueJob = {
  name: 'github.processIssue',
  schema: z.object({ action: z.string(), issue: z.object({ id: z.number() }) }),
  retry: { attempts: 3, backoff: 'exponential' as const },
  handler: async (data, ctx) => {
    ctx.logger.info({ issueId: data.issue.id }, 'Processing GitHub issue');
  },
};
```

---

## When to Use Direct vs Queue

| | Direct (`mode: 'direct'`) | Queue (`mode: 'queue'`) |
|-|---------------------------|-------------------------|
| **Use when** | Response must be synchronous, low latency needed | Processing is slow or can be retried independently |
| **Backed by** | `communication.call()` (in-process) | `jobQueue.enqueue()` (BullMQ/Redis) |
| **Retries** | No built-in retry | BullMQ retry with backoff |
| **Example** | Stripe payment confirmation | GitHub CI build trigger |

---

## Checklist

- [ ] Auth controller created (extends `ApiKeyAuthController` or `OAuthAuthController`)
- [ ] Webhook controller created with `prefix`, `auth`, and routes in `init()`
- [ ] Routes configured with correct `mode`, `procedure`/`jobName`, and optional `ttl`
- [ ] Controller registered on `WebhookServer`
- [ ] Communication handler or job registered for each route
- [ ] Webhook secret stored via `@mariachi/config` (never hardcoded)

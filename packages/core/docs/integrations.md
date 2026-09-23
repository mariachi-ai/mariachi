# Integrations

How to wrap a third-party API in Mariachi: validated functions with retries, credentials resolved
per tenant, a registry you can call by name, and verified inbound webhooks. `integrations/slack/`
is the reference implementation.

## Define a function

```ts
import { defineIntegrationFn, resolveTenantCredential, type IntegrationContext } from '@mariachi/integrations';

export const createIssue = defineIntegrationFn({
  name: 'tracker.createIssue',
  input: CreateIssueInput,            // Zod
  output: CreateIssueOutput,          // Zod
  retry: { attempts: 3, backoff: 'exponential' },
  handler: async (input, ctx: IntegrationContext) => {
    const token = await resolveTenantCredential(ctx, 'tracker.apiToken', ctx.secrets!, ctx.decrypt, { fallbackToGlobal: false });
    return trackerClient(token).issues.create(input);
  },
});
```

- Input is validated once, before the first attempt. Invalid input fails with
  `integrations/invalid-input` and is never retried.
- The handler is retried with `retry` from `@mariachi/core` (100 ms base delay). A missing
  credential isn't retried; other errors are.
- Output is validated after the call (`integrations/invalid-output`, HTTP 502), so a changed
  upstream response is caught at the boundary.
- Errors that aren't already `IntegrationError` become `integrations/call-failed` with the function
  name.

## Credentials

`resolveTenantCredential(ctx, key, secrets, decryptor?, options?)` reads the tenant's secret
(`secrets.get(key, tenantId)`) and decrypts it with `@mariachi/encryption` when a decryptor is
given. Store per-tenant credentials encrypted, never in plain config.

By default a tenant without its own secret falls back to the global one (`secrets.get(key)`). That
suits integrations your platform owns (one Slack workspace for alerts). For credentials that must
be the tenant's own (their Slack workspace, their CRM account), pass
`{ fallbackToGlobal: false }`, so a missing tenant secret fails instead of silently using yours.

## Register and call

```ts
const registry = new IntegrationRegistry();
registry.register({
  name: 'tracker',
  description: 'Issue tracker',
  credentialSchema: TrackerCredentials,
  functions: ['tracker.createIssue'],
  handlers: { createIssue },
});

await registry.call('tracker.createIssue', input, integrationCtx);
```

- Every name in `functions` must have a handler, or `register` throws
  `integrations/missing-handler`. The registry never lists something it can't call.
- Registering the same integration twice throws `integrations/duplicate`.
- `call` accepts `integration.fn`, or the bare `fn` when only one integration defines it. A bare
  name used by several integrations throws `integrations/ambiguous-function`; an unknown one throws
  `integrations/unknown-function`.

## Inbound webhooks

`defineWebhookHandler({ verify, parse, handle })` checks the request before parsing it. For Slack,
verify with the signing secret over the raw body:

```ts
import { assertSlackSignature } from '@mariachi/integrations';

assertSlackSignature(config.slack.signingSecret, headers, rawBody);   // throws integrations/invalid-signature
```

`verifySlackSignature` returns a boolean instead, and both reject requests more than five minutes
old. Always pass the raw bytes (`ctx.request.rawBody` in a facade handler); re-serialized JSON won't
match the signature. For a full webhook endpoint with dedup, see
[recipes/add-webhook-endpoint.md](./recipes/add-webhook-endpoint.md).

## Step-by-step recipe

For a full walkthrough with credentials, client, types and tests, see
[recipes/add-integration.md](./recipes/add-integration.md).

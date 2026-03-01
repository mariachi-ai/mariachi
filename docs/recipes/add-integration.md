# Recipe: Add a Third-Party Integration

This walks through adding a new integration (e.g. GitHub, Twilio) using the `@mariachi/integrations` pattern. Integrations live in `integrations/<name>/` and follow a standard structure.

The existing Slack integration (`integrations/slack/`) is used as the reference throughout.

---

## Structure

```
integrations/<name>/
├── index.ts         # Integration functions (defineIntegrationFn)
├── credentials.ts   # Zod-validated credential schema
├── client.ts        # Raw API client (fetch calls)
├── types.ts         # Input/output Zod schemas
└── test.ts          # Dry-run test
```

---

## 1. Generate the Scaffold (Optional)

```bash
mariachi generate integration <name>
```

Or create the files manually following the structure above.

---

## 2. Define Credentials

Every integration has a Zod schema for its credentials. Never hardcode secrets.

**File:** `integrations/<name>/credentials.ts`

```ts
import { z } from 'zod';

export const GitHubCredentials = z.object({
  token: z.string().min(1),
  webhookSecret: z.string().min(1),
});

export type GitHubCredentials = z.infer<typeof GitHubCredentials>;
```

Store actual values via `@mariachi/config` (env variables), not in code.

**Reference:** `integrations/slack/credentials.ts`

---

## 3. Define Input/Output Types

Use Zod schemas for all inputs and outputs.

**File:** `integrations/<name>/types.ts`

```ts
import { z } from 'zod';

export const CreateIssueInput = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
});

export const CreateIssueOutput = z.object({
  id: z.number(),
  number: z.number(),
  url: z.string(),
});

export type CreateIssueInput = z.infer<typeof CreateIssueInput>;
export type CreateIssueOutput = z.infer<typeof CreateIssueOutput>;
```

**Reference:** `integrations/slack/types.ts`

---

## 4. Implement the Client

The client is a thin wrapper around the external API. It receives validated credentials and input.

**File:** `integrations/<name>/client.ts`

```ts
import type { GitHubCredentials } from './credentials';
import type { CreateIssueInput, CreateIssueOutput } from './types';

export async function createIssue(
  credentials: GitHubCredentials,
  input: CreateIssueInput,
): Promise<CreateIssueOutput> {
  const url = `https://api.github.com/repos/${input.owner}/${input.repo}/issues`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.token}`,
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ title: input.title, body: input.body }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { id: number; number: number; html_url: string };
  return { id: data.id, number: data.number, url: data.html_url };
}
```

**Reference:** `integrations/slack/client.ts`

---

## 5. Define the Integration Function

Use `defineIntegrationFn` from `@mariachi/integrations` to wrap the client call with schema validation, retry config, and context.

**File:** `integrations/<name>/index.ts`

```ts
import { defineIntegrationFn } from '@mariachi/integrations';
import type { IntegrationContext } from '@mariachi/integrations';
import { createIssue } from './client';
import type { GitHubCredentials } from './credentials';
import { CreateIssueInput, CreateIssueOutput } from './types';

export interface GitHubIntegrationContext extends IntegrationContext {
  credentials: GitHubCredentials;
}

export const githubCreateIssue = defineIntegrationFn<CreateIssueInput, CreateIssueOutput>({
  name: 'github.createIssue',
  input: CreateIssueInput,
  output: CreateIssueOutput,
  handler: async (input: CreateIssueInput, ctx: IntegrationContext): Promise<CreateIssueOutput> => {
    const credentials = (ctx as GitHubIntegrationContext).credentials;
    if (!credentials) {
      throw new Error('GitHub credentials required');
    }
    return createIssue(credentials, input);
  },
  retry: { attempts: 3, backoff: 'exponential' },
});
```

**Key fields:**
- `name` -- unique identifier, conventionally `<provider>.<action>`
- `input` / `output` -- Zod schemas for validation
- `handler` -- receives validated input and `IntegrationContext` (with credentials)
- `retry` -- optional retry config (`attempts`, `backoff: 'exponential' | 'fixed'`)

**Reference:** `integrations/slack/index.ts`

---

## 6. Register in the Registry (Optional)

For discoverability, register the integration in a central registry.

```ts
import { IntegrationRegistry } from '@mariachi/integrations';
import { GitHubCredentials } from './credentials';

const registry = new IntegrationRegistry();

registry.register({
  name: 'github',
  description: 'GitHub integration for issues and repositories',
  credentialSchema: GitHubCredentials,
  functions: ['github.createIssue'],
});
```

---

## 7. Add a Test

Write a dry-run test that validates credentials and input without calling the real API.

**File:** `integrations/<name>/test.ts`

```ts
import { CreateIssueInput } from './types';
import { GitHubCredentials } from './credentials';

export async function dryRun(
  credentials: GitHubCredentials,
  input: { owner: string; repo: string; title: string; body?: string },
): Promise<{ ok: true; id: number; number: number; url: string }> {
  GitHubCredentials.parse(credentials);
  CreateIssueInput.parse(input);
  return {
    ok: true,
    id: 12345,
    number: 1,
    url: `https://github.com/${input.owner}/${input.repo}/issues/1`,
  };
}
```

**Reference:** `integrations/slack/test.ts`

---

## Checklist

- [ ] Credentials schema defined in `credentials.ts` (Zod)
- [ ] Input/output types defined in `types.ts` (Zod)
- [ ] Client function implemented in `client.ts`
- [ ] Integration function defined with `defineIntegrationFn` in `index.ts`
- [ ] Retry config set appropriately
- [ ] Dry-run test in `test.ts`
- [ ] Secrets stored via env/config, never hardcoded

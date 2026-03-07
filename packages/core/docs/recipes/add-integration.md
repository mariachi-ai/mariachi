# Recipe: Add a Third-Party Integration

This walks through adding a new integration (e.g. GitHub, Twilio) using the `@mariachi/integrations` pattern.

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

## 1. Define Credentials

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

---

## 2. Define Input/Output Types

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

---

## 3. Implement the Client

The client is a thin wrapper around the external API.

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

---

## 4. Define the Integration Function

Use `defineIntegrationFn` from `@mariachi/integrations`.

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
- `name` — unique identifier, conventionally `<provider>.<action>`
- `input` / `output` — Zod schemas for validation
- `handler` — receives validated input and `IntegrationContext` (with credentials)
- `retry` — optional retry config

---

## 5. Register in the Registry (Optional)

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

## 6. Add a Test

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

---

## Checklist

- [ ] Credentials schema defined in `credentials.ts` (Zod)
- [ ] Input/output types defined in `types.ts` (Zod)
- [ ] Client function implemented in `client.ts`
- [ ] Integration function defined with `defineIntegrationFn` in `index.ts`
- [ ] Retry config set appropriately
- [ ] Dry-run test in `test.ts`
- [ ] Secrets stored via env/config, never hardcoded

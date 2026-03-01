# Integrations

How to add and configure third-party integrations in Mariachi.

## How to Add an Integration

1. **Generate the scaffold** (optional):

   ```bash
   mariachi generate integration <name>
   ```

2. **Define credentials** in `integrations/<name>/credentials.ts` using Zod:

   ```ts
   import { z } from 'zod';

   export const MyCredentials = z.object({
     apiKey: z.string().min(1),
     // ... other fields
   });

   export type MyCredentials = z.infer<typeof MyCredentials>;
   ```

3. **Define integration functions** in `integrations/<name>/index.ts` using `defineIntegrationFn`:

   ```ts
   import { defineIntegrationFn } from '@mariachi/integrations';
   import type { IntegrationContext } from '@mariachi/integrations';
   import { MyCredentials } from './credentials';
   import { InputSchema, OutputSchema } from './types';

   export interface MyIntegrationContext extends IntegrationContext {
     credentials: MyCredentials;
   }

   export const myAction = defineIntegrationFn({
     name: 'my.action',
     input: InputSchema,
     output: OutputSchema,
     handler: async (input, ctx) => {
       const creds = (ctx as MyIntegrationContext).credentials;
       // Call external API with creds
       return result;
     },
     retry: { attempts: 3, backoff: 'exponential' },
   });
   ```

4. **Register in the registry** (`integrations/registry.ts`):

   ```ts
   registry.register({
     name: 'my',
     description: 'My integration',
     credentialSchema: MyCredentials,
     functions: ['my.action'],
   });
   ```

## Credential Requirements

- Credentials are validated with Zod schemas.
- Store secrets via `@mariachi/config` (e.g., env adapter); never hardcode.
- Each integration defines its own credential schema.

## Current Integrations

### Slack

Slack workspace integration for messaging.

**Credential schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `botToken` | string | Yes | Slack Bot OAuth token (starts with `xoxb-`) |
| `signingSecret` | string | Yes | Slack signing secret for request verification |

**Functions:**

- `slack.sendMessage` — Send a message to a channel (input: `channel`, `text`, optional `threadTs`)

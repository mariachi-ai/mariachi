# AI

`@mariachi/ai` wraps language models behind sessions. A session keeps its history, enforces a token
budget, persists to Postgres and records cost for every response. Tools, agent loops and RAG build on
the same sessions.

## Wire it

```ts
import { createAI, DefaultAI } from '@mariachi/ai';
import { AnthropicAdapter } from '@mariachi/ai/anthropic';          // optional peer: @ai-sdk/anthropic
import { DrizzleAISessionStore } from '@mariachi/ai/postgres';

const ai = new DefaultAI(createAI({
  adapter: 'openai',
  apiKey: config.ai.apiKey,
  defaultModel: config.ai.model,                     // default gpt-4o-mini
  fallbackModels: config.ai.fallbackModels,          // tried on OpenAI when the model fails
  fallbackProviders: [{ id: 'anthropic', adapter: new AnthropicAdapter({ apiKey: config.ai.anthropicApiKey }), models: ['claude-sonnet-5'] }],
  sessions: new DrizzleAISessionStore(db),
  costTable: config.ai.costTable,
  onPersistError: (error, sessionId) => logger.error({ sessionId, error: error.message }, 'AI session save failed'),
}), instrumentation);
```

To make Claude the primary model, pass `adapter: 'custom', instance: new AnthropicAdapter(...)`.
`AISdkAdapter` accepts any AI SDK provider's model factory, so other providers don't need a new
adapter class. Add the tables from `@mariachi/ai/schema`.

## Sessions

```ts
const session = await ai.createSession(ctx, `support:${ticket.id}`, {
  systemPrompt: 'You are a support agent.',
  tenantId: ctx.tenantId, userId: ctx.userId,
  budget: { maxTotalTokens: 50_000, warningThresholdPercent: 80 },
});
const reply = await ai.send(ctx, session, 'Where is my order?');

// Another request or process: load the stored session and continue it.
const again = await ai.sessions.open(`support:${ticket.id}`);
for await (const chunk of again!.stream!('And when will it arrive?')) res.write(chunk.content);
```

- Session ids are any string you choose. `createSession` waits for the store to save the session
  and throws `ai/session-persist-failed` if it can't.
- Messages are stored with their position, and each save appends only the new ones in one
  transaction.
- `sessions.get(id)` returns only sessions in this process's memory; `sessions.open(id)` also loads
  from the store.

## Budgets and cost

A session with `budget.maxTotalTokens` refuses the next `send` once it has used the budget
(`ai/token-budget-exceeded`, HTTP 402). Another provider wouldn't help, so the fallback chain
doesn't try one.

Cost is `tokens / 1000 × rate` from the cost table. `config.ai.costTable` (env `AI_COST_TABLE` as
JSON) is merged over the built-in OpenAI rates, and dated ids (`gpt-4o-2024-08-06`) use the entry
that prefixes them. A model with no entry costs 0, and `DefaultAI` logs a warning once per model, so
add rates for every model you use, Claude models included.

```bash
AI_COST_TABLE='{"claude-sonnet-5":{"input":0.003,"output":0.015}}'
```

## Fallback

`FallbackAdapter` tries providers in order, and within a provider its `models` in order. A model
requested by the session only goes to the first provider, because model ids are
provider-specific. A stream falls through only if the provider fails before its first chunk. After
that the error reaches the caller, so you never get half of one answer and half of another. When
everything fails, the error is `ai/providers-exhausted` with each attempt's message.

## Tools and agents

`runAgent` loops model → tool calls → results until the model answers. A tool that throws doesn't
end the loop: its error goes back to the model as a tool result (`isError: true`) so the model can
retry or explain.

## Prompts

```ts
ai.registerPrompt({ name: 'summary', version: '2', template: 'Summarize for {{audience}}: {{text}}' });
ai.prompts.render('summary', { audience: 'executives', text });   // highest version wins, numerically
```

Values are inserted literally (a `$&` in user text stays `$&`). Unknown placeholders are left in
place, and a missing prompt throws `ai/prompt-not-found`.

## Errors

`AIError`: `ai/request-failed` (provider error, with `provider` and `model` in the metadata),
`ai/providers-exhausted`, `ai/token-budget-exceeded`, `ai/session-not-found`,
`ai/session-persist-failed`, `ai/prompt-not-found` and `ai/config`.

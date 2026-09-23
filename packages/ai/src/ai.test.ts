import { describe, expect, it } from 'vitest';
import { AIError } from '@mariachi/core';
import { FallbackAdapter } from './adapters/fallback';
import { estimateCost, resolveRates } from './cost';
import { PromptRegistry } from './prompts/registry';
import { SessionManager, type Adapter } from './session/manager';
import type { AIResponse, StreamChunk } from './types';

const ok = (model = 'm'): AIResponse => ({ content: 'ok', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, model, latencyMs: 1 });

describe('FallbackAdapter', () => {
  it('sends the requested model only to the first provider', async () => {
    const seen: string[] = [];
    const failing: Adapter = { generate: async (_m, c) => { seen.push(`a:${c.model}`); throw new Error('down'); } };
    const backup: Adapter = { generate: async (_m, c) => { seen.push(`b:${c.model}`); return ok(c.model); } };
    const adapter = new FallbackAdapter([
      { id: 'openai', adapter: failing },
      { id: 'anthropic', adapter: backup, models: ['claude-sonnet-5'] },
    ]);
    await adapter.generate([], { model: 'gpt-4o' });
    expect(seen).toEqual(['a:gpt-4o', 'b:claude-sonnet-5']);
  });

  it('does not fall through on a budget error', async () => {
    let called = false;
    const adapter = new FallbackAdapter([
      { id: 'a', adapter: { generate: async () => { throw new AIError('ai/token-budget-exceeded', 'no'); } } },
      { id: 'b', adapter: { generate: async () => { called = true; return ok(); } } },
    ]);
    await expect(adapter.generate([])).rejects.toMatchObject({ code: 'ai/token-budget-exceeded' });
    expect(called).toBe(false);
  });

  it('falls through a stream that fails before its first chunk, not after', async () => {
    // biome-ignore lint/correctness/useYield: a stream that fails before its first chunk
    async function* broken(): AsyncIterable<StreamChunk> { throw new Error('down'); }
    async function* good(): AsyncIterable<StreamChunk> { yield { content: 'hi', done: false }; yield { content: '', done: true }; }
    async function* midway(): AsyncIterable<StreamChunk> { yield { content: 'h', done: false }; throw new Error('cut'); }
    const collect = async (it: AsyncIterable<StreamChunk>) => { const out: string[] = []; for await (const c of it) out.push(c.content); return out; };

    const recovered = new FallbackAdapter([
      { id: 'a', adapter: { generate: async () => ok(), stream: broken } },
      { id: 'b', adapter: { generate: async () => ok(), stream: good } },
    ]);
    expect(await collect(recovered.stream([]))).toEqual(['hi', '']);

    const cut = new FallbackAdapter([
      { id: 'a', adapter: { generate: async () => ok(), stream: midway } },
      { id: 'b', adapter: { generate: async () => ok(), stream: good } },
    ]);
    await expect(collect(cut.stream([]))).rejects.toThrow('cut');
  });
});

describe('cost', () => {
  it('merges overrides, matches dated ids by prefix, and prices unknown models at 0', () => {
    expect(resolveRates('gpt-4o-2024-08-06')).toEqual(resolveRates('gpt-4o'));
    expect(resolveRates('gpt-4o-mini-2024-07-18')).toEqual(resolveRates('gpt-4o-mini'));
    expect(estimateCost('claude-sonnet-5', 1000, 1000)).toBe(0);
    expect(estimateCost('claude-sonnet-5', 1000, 1000, { 'claude-sonnet-5': { input: 1, output: 2 } })).toBe(3);
    expect(resolveRates('gpt-4', { 'claude-x': { input: 1, output: 1 } })).toBeDefined();
  });
});

describe('PromptRegistry', () => {
  it('picks the highest version numerically and inserts values literally', () => {
    const prompts = new PromptRegistry();
    prompts.register({ name: 'greet', version: '9', template: 'v9' });
    prompts.register({ name: 'greet', version: '10', template: 'Hi {{name}}, {{missing}}' });
    expect(prompts.render('greet', { name: '$& $1' })).toBe('Hi $& $1, {{missing}}');
    expect(() => prompts.render('nope', {})).toThrow(expect.objectContaining({ code: 'ai/prompt-not-found' }));
  });
});

describe('SessionManager persistence', () => {
  it('createPersisted surfaces store failures and create reports them', async () => {
    const store = { save: async () => { throw new Error('db down'); }, load: async () => null };
    const errors: string[] = [];
    const sessions = new SessionManager({ generate: async () => ok() }, store, (error, id) => errors.push(`${id}:${error.message}`));
    await expect(sessions.createPersisted('s1', {})).rejects.toMatchObject({ code: 'ai/session-persist-failed' });
    expect(sessions.get('s1')).toBeUndefined();
    sessions.create('s2', {});
    await new Promise((r) => setTimeout(r, 0));
    expect(errors).toEqual(['s2:db down']);
  });
});

describe('AnthropicAdapter', () => {
  it('is an AI SDK adapter that wraps provider failures in AIError', async () => {
    const { AnthropicAdapter } = await import('./anthropic');
    const failingFetch = async () => new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'bad key' } }), { status: 401 });
    const adapter = new AnthropicAdapter({ apiKey: 'x' });
    expect(adapter.name).toBe('anthropic');
    // Route the SDK at a stub so the test never reaches the network.
    const original = globalThis.fetch;
    globalThis.fetch = failingFetch as typeof fetch;
    try {
      await expect(adapter.generate([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({ code: 'ai/request-failed' });
    } finally {
      globalThis.fetch = original;
    }
  });
});

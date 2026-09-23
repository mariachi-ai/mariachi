import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { runAgent } from '../patterns/agent';
import { SessionManager, type Adapter } from './manager';
import { ToolRegistry } from '../tools/registry';
import type { AIResponse } from '../types';

function response(content: string, extra: Partial<AIResponse> = {}): AIResponse {
  return { content, usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 }, model: 'test', latencyMs: 1, ...extra };
}

describe('SessionManager', () => {
  it('get keeps the history create already recorded', async () => {
    const adapter: Adapter = { generate: async () => response('hi') };
    const sessions = new SessionManager(adapter);
    const created = sessions.create('s1', { model: 'test', systemPrompt: 'be brief' });
    await created.send('hello');
    const again = sessions.get('s1');
    expect(again?.getHistory().map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
    expect(again?.usage?.().totalTokens).toBe(5);
  });

  it('refuses another send once the token budget is spent', async () => {
    const adapter: Adapter = { generate: async () => response('hi') };
    const session = new SessionManager(adapter).create('s1', { model: 'test', budget: { maxTotalTokens: 5 } });
    await session.send('hello');
    await expect(session.send('again')).rejects.toMatchObject({ code: 'ai/token-budget-exceeded' });
  });

  it('falls through to the next model', async () => {
    const seen: Array<string | undefined> = [];
    const adapter: Adapter = {
      generate: async (_messages, config) => {
        seen.push(config.model);
        if (config.model === 'first') throw new Error('down');
        return response('ok');
      },
    };
    const session = new SessionManager(adapter).create('s1', { models: ['first', 'second'] });
    expect((await session.send('hello')).content).toBe('ok');
    expect(seen).toEqual(['first', 'second']);
  });
});

describe('runAgent', () => {
  it('turns a tool failure into a tool result', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'explode',
      description: 'fails',
      schema: z.object({}),
      handler: async () => { throw new Error('boom'); },
    });
    let calls = 0;
    const adapter: Adapter = {
      generate: async (messages) => {
        calls += 1;
        if (calls === 1) {
          return response('', { toolCalls: [{ id: 'c1', name: 'explode', arguments: {} }] });
        }
        const last = messages.at(-1);
        expect(last?.role).toBe('tool');
        expect(last?.content).toContain('boom');
        return response('recovered');
      },
    };
    const session = new SessionManager(adapter).create('s1', { model: 'test', tools: registry.getAll() });
    const result = await runAgent(session, 'go', { maxIterations: 3, tools: registry.getAll(), toolRegistry: registry });
    expect(result.content).toBe('recovered');
  });
});

import { AIError } from '@mariachi/core';
import type {
  AIMessage,
  AIResponse,
  AISession,
  SessionConfig,
  StreamChunk,
  ToolDefinition,
  ToolResult,
} from '../types';

export interface Adapter {
  generate(
    messages: AIMessage[],
    config: { model?: string; tools?: ToolDefinition[] },
  ): Promise<AIResponse>;
  stream?(
    messages: AIMessage[],
    config: { model?: string; tools?: ToolDefinition[] },
  ): AsyncIterable<StreamChunk>;
}

export interface SessionState {
  messages: AIMessage[];
  config: SessionConfig;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/** Optional persistence for sessions, messages and running token totals. */
export interface AISessionStore {
  load(id: string): Promise<SessionState | null>;
  save(id: string, state: SessionState): Promise<void>;
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly adapter: Adapter,
    private readonly store?: AISessionStore,
    /** Called when the background save in `create` fails. `createPersisted` throws instead. */
    private readonly onPersistError?: (error: Error, sessionId: string) => void,
  ) {}

  /** Starts a session in memory and saves it in the background. Prefer `createPersisted` when a store is set. */
  create(id: string, config: SessionConfig): AISession {
    const state = this.init(id, config);
    this.store?.save(id, state).catch((error: unknown) => {
      this.onPersistError?.(error instanceof Error ? error : new Error(String(error)), id);
    });
    return this.bind(id);
  }

  /** Starts a session and waits until the store has saved it. */
  async createPersisted(id: string, config: SessionConfig): Promise<AISession> {
    const state = this.init(id, config);
    try {
      await this.store?.save(id, state);
    } catch (error) {
      this.sessions.delete(id);
      throw new AIError('ai/session-persist-failed', error instanceof Error ? error.message : String(error), { sessionId: id });
    }
    return this.bind(id);
  }

  private init(id: string, config: SessionConfig): SessionState {
    const messages: AIMessage[] = [];
    if (config.systemPrompt) messages.push({ role: 'system', content: config.systemPrompt });
    const state: SessionState = { messages, config, totalInputTokens: 0, totalOutputTokens: 0 };
    this.sessions.set(id, state);
    return state;
  }

  /** Returns the live session. Does not reset its history. */
  get(id: string): AISession | undefined {
    if (!this.sessions.has(id)) return undefined;
    return this.bind(id);
  }

  /** Loads a persisted session into memory when it is not already there. */
  async open(id: string): Promise<AISession | undefined> {
    if (!this.sessions.has(id) && this.store) {
      const loaded = await this.store.load(id);
      if (loaded) this.sessions.set(id, loaded);
    }
    return this.get(id);
  }

  private bind(id: string): AISession {
    const state = () => this.sessions.get(id);
    return {
      id,
      budget: state()?.config.budget,
      send: (message, toolResults) => this.doSend(id, message, toolResults),
      stream: (message) => this.doStream(id, message),
      getHistory: () => {
        const current = state();
        return current ? [...current.messages] : [];
      },
      usage: () => {
        const current = state();
        const inputTokens = current?.totalInputTokens ?? 0;
        const outputTokens = current?.totalOutputTokens ?? 0;
        return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
      },
    };
  }

  private require(id: string): SessionState {
    const state = this.sessions.get(id);
    if (!state) throw new AIError('ai/session-not-found', `Session ${id} not found`);
    return state;
  }

  private assertBudget(state: SessionState): void {
    const limit = state.config.budget?.maxTotalTokens;
    if (limit === undefined) return;
    const total = state.totalInputTokens + state.totalOutputTokens;
    if (total >= limit) {
      throw new AIError('ai/token-budget-exceeded', `Token budget exceeded: ${total}/${limit}`, { total, limit });
    }
  }

  private modelsFor(state: SessionState): Array<string | undefined> {
    if (state.config.models?.length) return state.config.models;
    return [state.config.model];
  }

  private async doSend(id: string, message: string, toolResults?: ToolResult[]): Promise<AIResponse> {
    const state = this.require(id);
    this.assertBudget(state);
    this.appendInput(state, message, toolResults);

    let lastError: unknown;
    for (const model of this.modelsFor(state)) {
      try {
        const response = await this.adapter.generate(state.messages, { model, tools: state.config.tools });
        this.record(state, response);
        await this.store?.save(id, state);
        return response;
      } catch (error) {
        if (error instanceof AIError && (error.code === 'ai/token-budget-exceeded' || error.code === 'ai/session-not-found')) throw error;
        lastError = error;
      }
    }
    throw lastError instanceof AIError
      ? lastError
      : new AIError('ai/request-failed', lastError instanceof Error ? lastError.message : 'AI request failed');
  }

  private async *doStream(id: string, message: string): AsyncIterable<StreamChunk> {
    const state = this.require(id);
    this.assertBudget(state);
    this.appendInput(state, message);
    const model = this.modelsFor(state)[0];
    if (!this.adapter.stream) {
      const response = await this.adapter.generate(state.messages, { model, tools: state.config.tools });
      this.record(state, response);
      await this.store?.save(id, state);
      yield { content: response.content, done: false };
      yield {
        content: '',
        done: true,
        usage: { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens },
      };
      return;
    }
    let text = '';
    let usage: StreamChunk['usage'];
    for await (const chunk of this.adapter.stream(state.messages, { model, tools: state.config.tools })) {
      text += chunk.content;
      if (chunk.usage) usage = chunk.usage;
      yield chunk;
    }
    const response: AIResponse = {
      content: text,
      usage: {
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        totalTokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0),
      },
      model: model ?? 'default',
      latencyMs: 0,
    };
    this.record(state, response);
    await this.store?.save(id, state);
  }

  private appendInput(state: SessionState, message: string, toolResults?: ToolResult[]): void {
    if (toolResults?.length) {
      for (const result of toolResults) {
        state.messages.push({
          role: 'tool',
          content: JSON.stringify({
            callId: result.callId,
            result: result.result,
            toolName: result.toolName,
            isError: result.isError,
          }),
        });
      }
    } else if (message) {
      state.messages.push({ role: 'user', content: message });
    }
  }

  private record(state: SessionState, response: AIResponse): void {
    state.totalInputTokens += response.usage.inputTokens;
    state.totalOutputTokens += response.usage.outputTokens;
    state.messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });
  }
}

export function createSessionManager(
  adapter: Adapter,
  store?: AISessionStore,
  onPersistError?: (error: Error, sessionId: string) => void,
): SessionManager {
  return new SessionManager(adapter, store, onPersistError);
}

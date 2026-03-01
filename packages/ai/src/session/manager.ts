import type {
  AIMessage,
  AISession,
  AIResponse,
  SessionConfig,
  ToolDefinition,
  ToolResult,
} from '../types';

export interface Adapter {
  generate(
    messages: AIMessage[],
    config: { model?: string; tools?: ToolDefinition[] },
  ): Promise<AIResponse>;
}

export class SessionManager {
  private adapter: Adapter;
  private sessions = new Map<string, { messages: AIMessage[]; config: SessionConfig }>();

  constructor(adapter: Adapter) {
    this.adapter = adapter;
  }

  create(id: string, config: SessionConfig): AISession {
    const messages: AIMessage[] = [];
    if (config.systemPrompt) {
      messages.push({ role: 'system', content: config.systemPrompt });
    }
    this.sessions.set(id, { messages, config });

    const session = this;
    return {
      id,
      send: async (message: string, toolResults?: ToolResult[]): Promise<AIResponse> => {
        return session.doSend(id, message, toolResults);
      },
      getHistory: (): AIMessage[] => {
        const s = session.sessions.get(id);
        return s ? [...s.messages] : [];
      },
    };
  }

  doSend(id: string, message: string, toolResults?: ToolResult[]): Promise<AIResponse> {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`Session ${id} not found`);
    const { messages, config } = s;

    if (toolResults?.length) {
      for (const tr of toolResults) {
        messages.push({
          role: 'tool',
          content: JSON.stringify({
            callId: tr.callId,
            result: tr.result,
            toolName: tr.toolName,
          }),
        });
      }
    } else if (message) {
      messages.push({ role: 'user', content: message });
    }

    return this.adapter.generate(messages, { model: config.model, tools: config.tools }).then((response) => {
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });
      return response;
    });
  }

  get(id: string): AISession | undefined {
    const s = this.sessions.get(id);
    if (!s) return undefined;
    return this.create(id, s.config);
  }
}

export function createSessionManager(adapter: Adapter): SessionManager {
  return new SessionManager(adapter);
}

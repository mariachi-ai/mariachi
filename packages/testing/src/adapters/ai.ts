import type { AISession, AIResponse, AIMessage, ToolResult } from '../types';

export class TestAISession implements AISession {
  readonly id: string;
  private readonly responses: string[];
  private responseIndex = 0;
  private readonly history: AIMessage[] = [];

  constructor(id: string, responses: string[]) {
    this.id = id;
    this.responses = responses;
  }

  async send(message: string, _toolResults?: ToolResult[]): Promise<AIResponse> {
    this.history.push({ role: 'user', content: message });
    const content = this.responses[this.responseIndex % this.responses.length];
    this.responseIndex++;
    this.history.push({ role: 'assistant', content });
    return {
      content,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      model: 'test',
      latencyMs: 0,
    };
  }

  getHistory(): AIMessage[] {
    return [...this.history];
  }
}

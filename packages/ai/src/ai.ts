import type { Context, Logger, Instrumentable } from '@mariachi/core';
import { withSpan, getContainer, KEYS, AIError } from '@mariachi/core';
import type { TracerAdapter, MetricsAdapter } from '@mariachi/core';
import type { AISession, AIResponse, SessionConfig, ToolDefinition, PromptTemplate, AITelemetryEntry, TokenBudget } from './types';
import type { SessionManager } from './session/manager';
import type { ToolRegistry } from './tools/registry';
import type { PromptRegistry } from './prompts/registry';
import type { AITelemetryTracker } from './telemetry';
import { estimateCost } from './cost';

export abstract class AI implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  readonly sessions: SessionManager;
  readonly tools: ToolRegistry;
  readonly prompts: PromptRegistry;
  readonly telemetry: AITelemetryTracker;

  constructor(config: { sessions: SessionManager; tools: ToolRegistry; prompts: PromptRegistry; telemetry: AITelemetryTracker }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.sessions = config.sessions;
    this.tools = config.tools;
    this.prompts = config.prompts;
    this.telemetry = config.telemetry;
  }

  async createSession(ctx: Context, id: string, sessionConfig: SessionConfig): Promise<AISession> {
    return withSpan(this.tracer, 'ai.createSession', { sessionId: id, model: sessionConfig.model ?? 'default' }, async () => {
      this.logger.info({ traceId: ctx.traceId, sessionId: id, model: sessionConfig.model }, 'Creating AI session');
      const session = this.sessions.create(id, sessionConfig);
      this.metrics?.increment('ai.session.created', 1, { model: sessionConfig.model ?? 'default' });
      return session;
    });
  }

  async send(ctx: Context, session: AISession, message: string): Promise<AIResponse> {
    return withSpan(this.tracer, 'ai.send', { sessionId: session.id }, async (span) => {
      const start = performance.now();
      this.logger.info({ traceId: ctx.traceId, sessionId: session.id }, 'Sending message to AI');
      
      try {
        const response = await session.send(message);
        const latencyMs = performance.now() - start;
        
        const cost = estimateCost(response.model, response.usage.inputTokens, response.usage.outputTokens);
        const entry: AITelemetryEntry = {
          sessionId: session.id,
          model: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          latencyMs,
          costUsd: cost,
          createdAt: new Date(),
        };
        this.telemetry.record(entry);

        this.metrics?.histogram('ai.request.latency', latencyMs, { model: response.model });
        this.metrics?.increment('ai.tokens.input', response.usage.inputTokens, { model: response.model });
        this.metrics?.increment('ai.tokens.output', response.usage.outputTokens, { model: response.model });
        this.metrics?.increment('ai.request.count', 1, { model: response.model });
        
        span?.setAttribute('model', response.model);
        span?.setAttribute('inputTokens', response.usage.inputTokens);
        span?.setAttribute('outputTokens', response.usage.outputTokens);
        span?.setAttribute('costUsd', cost);

        this.logger.info({
          traceId: ctx.traceId,
          sessionId: session.id,
          model: response.model,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          latencyMs,
          costUsd: cost,
        }, 'AI response received');

        await this.onResponse?.(ctx, session, response);
        return response;
      } catch (error) {
        this.metrics?.increment('ai.request.error', 1);
        this.logger.error({ traceId: ctx.traceId, sessionId: session.id, error: (error as Error).message }, 'AI request failed');
        await this.onRequestFailed?.(ctx, session, error as Error);
        throw new AIError('ai/request-failed', (error as Error).message);
      }
    });
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.register(tool);
    this.logger.info({ tool: tool.name }, 'Tool registered');
  }

  registerPrompt(prompt: PromptTemplate): void {
    this.prompts.register(prompt);
  }

  async checkTokenBudget(ctx: Context, session: AISession, budget: TokenBudget): Promise<{ allowed: boolean; reason?: string; usage: { total: number; limit: number } }> {
    const totalTokens = (session as any).totalInputTokens + (session as any).totalOutputTokens;
    const limit = budget.maxTotalTokens ?? Infinity;

    if (budget.warningThresholdPercent && totalTokens > limit * (budget.warningThresholdPercent / 100)) {
      this.logger.warn({ traceId: ctx.traceId, sessionId: session.id, totalTokens, limit }, 'Token budget warning threshold reached');
    }

    if (totalTokens > limit) {
      this.metrics?.increment('ai.token_budget.exceeded', 1);
      await this.onTokenBudgetExceeded?.(ctx, session, { total: totalTokens, limit });
      return { allowed: false, reason: `Token budget exceeded: ${totalTokens}/${limit}`, usage: { total: totalTokens, limit } };
    }

    return { allowed: true, usage: { total: totalTokens, limit } };
  }

  protected onResponse?(ctx: Context, session: AISession, response: AIResponse): Promise<void>;
  protected onRequestFailed?(ctx: Context, session: AISession, error: Error): Promise<void>;
  protected onTokenBudgetExceeded?(ctx: Context, session: AISession, usage: { total: number; limit: number }): Promise<void>;
}

export class DefaultAI extends AI {}

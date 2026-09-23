import { IntegrationError, retry } from '@mariachi/core';
import type {
  IntegrationFnDefinition,
  IntegrationContext,
  WebhookHandlerDefinition,
  WebhookRequest,
} from './types';

/** Errors that fail the same way on every attempt, so retrying only adds latency. */
const NON_RETRYABLE = new Set(['integrations/invalid-input', 'integrations/missing-credential', 'integrations/invalid-output']);

export function defineIntegrationFn<TInput, TOutput>(
  def: IntegrationFnDefinition<TInput, TOutput>,
): ((input: unknown, ctx: IntegrationContext) => Promise<TOutput>) & { integrationName: string } {
  const { input, output, handler, retry: retryConfig, name } = def;

  const execute = async (rawInput: unknown, ctx: IntegrationContext): Promise<TOutput> => {
    const parsed = input.safeParse(rawInput);
    if (!parsed.success) {
      throw new IntegrationError('integrations/invalid-input', `Invalid input for ${name}`, { name, issues: parsed.error.issues });
    }
    let result: TOutput;
    try {
      result = await retry(() => handler(parsed.data, ctx), {
        attempts: retryConfig?.attempts ?? 1,
        backoff: retryConfig?.backoff === 'linear' ? 'linear' : 'exponential',
        baseDelayMs: 100,
        jitter: false,
        retryOn: (error) => !(error instanceof IntegrationError && NON_RETRYABLE.has(error.code)),
      });
    } catch (error) {
      if (error instanceof IntegrationError) throw error;
      throw new IntegrationError('integrations/call-failed', error instanceof Error ? error.message : 'Integration call failed', {
        name,
      });
    }
    const checked = output.safeParse(result);
    if (!checked.success) {
      throw new IntegrationError('integrations/invalid-output', `Invalid output from ${name}`, { name, issues: checked.error.issues });
    }
    return checked.data;
  };
  return Object.assign(execute, { integrationName: name });
}

export function defineWebhookHandler<T>(
  def: WebhookHandlerDefinition<T>,
): (req: WebhookRequest, ctx: IntegrationContext) => Promise<void> {
  return async (req: WebhookRequest, ctx: IntegrationContext): Promise<void> => {
    if (!def.verify(req)) {
      throw new IntegrationError('integrations/invalid-signature', 'Webhook verification failed');
    }
    const payload = def.parse(req.body);
    await def.handle(payload, ctx);
  };
}

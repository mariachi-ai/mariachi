import type {
  IntegrationFnDefinition,
  IntegrationContext,
  WebhookHandlerDefinition,
  WebhookRequest,
} from './types';

export function defineIntegrationFn<TInput, TOutput>(
  def: IntegrationFnDefinition<TInput, TOutput>
): (input: TInput, ctx: IntegrationContext) => Promise<TOutput> {
  const { input, output, handler, retry } = def;

  const execute = async (
    rawInput: TInput,
    ctx: IntegrationContext
  ): Promise<TOutput> => {
    const parsed = input.parse(rawInput);
    let result: TOutput;
    const maxAttempts = retry?.attempts ?? 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await handler(parsed, ctx);
        return output.parse(result);
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        const delay =
          retry?.backoff === 'exponential'
            ? Math.pow(2, attempt - 1) * 100
            : attempt * 100;
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw new Error('Unreachable');
  };

  return execute;
}

export function defineWebhookHandler<T>(
  def: WebhookHandlerDefinition<T>
): (req: WebhookRequest, ctx: IntegrationContext) => Promise<void> {
  return async (req: WebhookRequest, ctx: IntegrationContext): Promise<void> => {
    if (!def.verify(req)) {
      throw new Error('Webhook verification failed');
    }
    const payload = def.parse(req.body);
    await def.handle(payload, ctx);
  };
}

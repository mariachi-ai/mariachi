import type { Logger } from '@mariachi/core';
import type { MetricsAdapter } from '@mariachi/core';
import type { BillingAdapter, WebhookEvent } from '../types';

export type WebhookProcessorFn = (event: WebhookEvent, ctx: WebhookHandlerContext) => Promise<void>;

export interface WebhookHandlerContext {
  logger: Logger;
  metrics?: MetricsAdapter;
  adapter: BillingAdapter;
}

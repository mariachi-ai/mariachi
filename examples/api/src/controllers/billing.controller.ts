import { BaseController, type HttpContext } from '@mariachi/api-facade';
import { getContainer, KEYS } from '@mariachi/core';
import { z } from 'zod';
import { DefaultBilling, createWebhookHandler } from '@mariachi/billing';
import type { BillingAdapter } from '@mariachi/billing';

const CreateSubscriptionSchema = z.object({
  customerId: z.string(),
  planId: z.string(),
});

export class BillingController extends BaseController {
  readonly prefix = 'billing';

  init() {
    this.post(this.buildPath('subscriptions'), this.createSubscription);
    this.post(this.buildPath('webhooks'), { auth: false }, this.handleWebhook);
  }

  createSubscription = async (ctx: HttpContext, body: unknown) => {
    const input = CreateSubscriptionSchema.parse(body);
    const adapter = getContainer().resolve<BillingAdapter>(KEYS.Billing);
    const billing = new DefaultBilling({ adapter });
    const sub = await billing.createSubscription(ctx, input.customerId, input.planId, crypto.randomUUID());
    return { status: 201, body: sub };
  };

  handleWebhook = async (ctx: HttpContext, body: unknown) => {
    const adapter = getContainer().resolve<BillingAdapter>(KEYS.Billing);
    const handler = createWebhookHandler({
      secret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
      adapter,
      logger: ctx.logger,
    });
    const result = await handler.verifyAndProcess(body as Buffer, '');
    return { status: 200, body: { received: true, processed: result.processed } };
  };
}

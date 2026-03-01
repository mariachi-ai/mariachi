import { z } from 'zod';
import { BaseController, type HttpContext } from '@mariachi/api-facade';
import { createCommunication } from '@mariachi/communication';

const CreateChargeInput = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  tenantId: z.string(),
  customerId: z.string().optional(),
});

const GetSubscriptionInput = z.object({
  subscriptionId: z.string(),
});

const communication = createCommunication();

export class BillingController extends BaseController {
  readonly prefix = 'billing';

  init() {
    this.post(this.buildPath('charges'), this.createCharge);
    this.get(this.buildPath('subscriptions/:subscriptionId'), this.getSubscription);
  }

  createCharge = async (ctx: HttpContext, body: unknown) => {
    const input = CreateChargeInput.parse(body);
    return communication.call('billing.createCharge', ctx, input);
  };

  getSubscription = async (ctx: HttpContext, _body: unknown, params: Record<string, string>) => {
    const input = GetSubscriptionInput.parse({ subscriptionId: params.subscriptionId });
    return communication.call('billing.getSubscription', ctx, input);
  };
}

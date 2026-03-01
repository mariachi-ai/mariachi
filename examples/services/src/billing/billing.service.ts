import type { Context } from '@mariachi/core';
import { getContainer, KEYS } from '@mariachi/core';
import { Billing, DefaultBilling } from '@mariachi/billing';
import type { BillingAdapter, Subscription, Customer } from '@mariachi/billing';

export class AppBilling extends DefaultBilling {
  protected override async onSubscriptionCreated(ctx: Context, sub: Subscription): Promise<void> {
    ctx.logger.info({ subscriptionId: sub.id, planId: sub.planId }, 'Custom hook: subscription created, updating tenant features');
  }

  protected override async onPaymentFailed(ctx: Context, error: Error): Promise<void> {
    ctx.logger.warn({ error: error.message }, 'Custom hook: payment failed, notifying user');
  }
}

export function createAppBilling(): AppBilling {
  const adapter = getContainer().resolve<BillingAdapter>(KEYS.Billing);
  return new AppBilling({ adapter });
}

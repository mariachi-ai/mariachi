import type { BillingEvent, BillingStore, ProviderEvent, SubscriptionStatus } from '../types';
import {
  idOf,
  mapChargeObject,
  mapCustomer,
  mapDispute,
  mapInvoice,
  mapPaymentIntent,
  mapPrice,
  mapRefund,
  mapSubscription,
} from '../adapters/stripe-mappers';

type Loose = Record<string, any>;

/**
 * Resolves the tenant for an event: the object's own `metadata.tenantId`, then the
 * locally mirrored customer.
 */
async function resolveTenant(store: BillingStore | undefined, own: string | null, customerId: string | null): Promise<string | null> {
  if (own) return own;
  if (!store || !customerId) return null;
  return (await store.findCustomer(customerId))?.tenantId ?? null;
}

/**
 * Converts a verified provider event into normalized billing events and mirrors
 * state into `store`. Returns an empty array for event types Mariachi doesn't model.
 */
export async function normalizeAndSync(event: ProviderEvent, store?: BillingStore): Promise<BillingEvent[]> {
  const obj = event.object as Loose;
  const base = { eventId: event.id, occurredAt: event.createdAt, providerType: event.type };

  switch (event.type) {
    case 'customer.created':
    case 'customer.updated': {
      const customer = mapCustomer(obj);
      await store?.upsertCustomer(customer, event.createdAt);
      const tenantId = await resolveTenant(store, customer.tenantId, customer.id);
      return [{ ...base, type: 'customer.synced', tenantId, customer: { ...customer, tenantId } }];
    }

    case 'customer.deleted': {
      const tenantId = await resolveTenant(store, mapCustomer(obj).tenantId, obj.id);
      await store?.markCustomerDeleted(obj.id, event.createdAt);
      return [{ ...base, type: 'customer.deleted', tenantId, customerId: obj.id }];
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
    case 'customer.subscription.trial_will_end': {
      const mapped = mapSubscription(obj);
      const tenantId = await resolveTenant(store, mapped.tenantId, mapped.customerId);
      const subscription = { ...mapped, tenantId };
      const previousFromEvent = (event.previousAttributes?.status as SubscriptionStatus | undefined) ?? null;
      let previousStatus = previousFromEvent;
      if (store) {
        const result = await store.upsertSubscription(subscription, event.createdAt);
        previousStatus = previousFromEvent ?? result.previousStatus;
        // A newer event already won; don't emit transitions for stale data.
        if (!result.applied) return [];
      }
      if (event.type === 'customer.subscription.trial_will_end') {
        return [{ ...base, type: 'subscription.trial_will_end', tenantId, subscription }];
      }
      const events: BillingEvent[] = [{ ...base, type: 'subscription.synced', tenantId, subscription, previousStatus }];
      if (subscription.status === 'canceled' && previousStatus !== 'canceled') {
        events.push({ ...base, type: 'subscription.canceled', tenantId, subscription });
      }
      return events;
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const mapped = mapInvoice(obj);
      const tenantId = await resolveTenant(store, mapped.tenantId, mapped.customerId);
      const invoice = { ...mapped, tenantId };
      await store?.upsertInvoice(invoice, event.createdAt);
      return [{ ...base, type: event.type, tenantId, invoice }];
    }

    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed': {
      const mapped = mapPaymentIntent(obj);
      const tenantId = await resolveTenant(store, mapped.tenantId, mapped.customerId);
      const charge = { ...mapped, tenantId, status: event.type === 'payment_intent.succeeded' ? ('succeeded' as const) : ('failed' as const) };
      await store?.upsertCharge(charge, event.createdAt);
      return [{ ...base, type: event.type === 'payment_intent.succeeded' ? 'payment.succeeded' : 'payment.failed', tenantId, charge }];
    }

    case 'charge.refunded': {
      const mapped = mapChargeObject(obj);
      const tenantId = await resolveTenant(store, mapped.tenantId, mapped.customerId);
      const charge = { ...mapped, tenantId };
      const latest = (obj.refunds?.data as Loose[] | undefined)?.[0];
      const refund = latest
        ? { ...mapRefund(latest, charge.id), chargeId: charge.id, tenantId }
        : {
            id: `${event.id}:refund`,
            chargeId: charge.id,
            tenantId,
            amount: charge.amountRefunded,
            currency: charge.currency,
            reason: null,
            status: 'succeeded' as const,
          };
      await store?.upsertCharge(charge, event.createdAt);
      await store?.upsertRefund(refund);
      return [{ ...base, type: 'charge.refunded', tenantId, refund, charge }];
    }

    case 'charge.dispute.created':
    case 'charge.dispute.closed': {
      const mapped = mapDispute(obj);
      const tenantId = await resolveTenant(store, mapped.tenantId, null);
      const dispute = { ...mapped, tenantId };
      await store?.upsertDispute(dispute, event.createdAt);
      return [{ ...base, type: event.type === 'charge.dispute.created' ? 'dispute.created' : 'dispute.closed', tenantId, dispute }];
    }

    case 'checkout.session.completed': {
      const customerId = idOf(obj.customer);
      const tenantId = await resolveTenant(store, (obj.metadata as Loose | undefined)?.tenantId ?? null, customerId);
      return [
        {
          ...base,
          type: 'checkout.completed',
          tenantId,
          sessionId: obj.id,
          customerId,
          subscriptionId: idOf(obj.subscription),
          mode: String(obj.mode),
        },
      ];
    }

    case 'price.created':
    case 'price.updated':
    case 'price.deleted': {
      const plan = mapPrice(obj);
      if (event.type === 'price.deleted') plan.active = false;
      await store?.upsertPlan(plan, event.createdAt);
      return [{ ...base, type: 'plan.synced', tenantId: null, plan }];
    }

    default:
      return [];
  }
}

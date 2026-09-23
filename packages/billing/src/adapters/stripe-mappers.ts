import type Stripe from 'stripe';
import type { Charge, Customer, Dispute, Invoice, Plan, Refund, Subscription, SubscriptionStatus } from '../types';

type Loose = Record<string, any>;

const SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

export function idOf(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id);
  return null;
}

export function toDate(seconds: unknown): Date | null {
  return typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000) : null;
}

function metadataOf(obj: Loose): Record<string, string> {
  return (obj.metadata as Record<string, string> | undefined) ?? {};
}

export function tenantOf(obj: Loose): string | null {
  const md = metadataOf(obj);
  return md.tenantId ?? md.tenant_id ?? null;
}

export function mapCustomer(c: Stripe.Customer | Loose): Customer {
  const obj = c as Loose;
  return {
    id: obj.id,
    email: obj.email ?? null,
    name: obj.name ?? null,
    tenantId: tenantOf(obj),
    delinquent: Boolean(obj.delinquent),
    metadata: metadataOf(obj),
  };
}

export function mapSubscription(s: Stripe.Subscription | Loose): Subscription {
  const obj = s as Loose;
  const item = obj.items?.data?.[0] as Loose | undefined;
  const status = SUBSCRIPTION_STATUSES.has(obj.status) ? (obj.status as SubscriptionStatus) : 'incomplete';
  return {
    id: obj.id,
    customerId: idOf(obj.customer) ?? '',
    tenantId: tenantOf(obj),
    planId: idOf(item?.price) ?? idOf(item?.plan) ?? '',
    quantity: item?.quantity ?? obj.quantity ?? 1,
    status,
    currentPeriodStart: toDate(obj.current_period_start ?? item?.current_period_start),
    currentPeriodEnd: toDate(obj.current_period_end ?? item?.current_period_end),
    cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end),
    cancelAt: toDate(obj.cancel_at),
    canceledAt: toDate(obj.canceled_at),
    trialEnd: toDate(obj.trial_end),
    metadata: metadataOf(obj),
  };
}

const PI_STATUS: Record<string, Charge['status']> = {
  succeeded: 'succeeded',
  processing: 'pending',
  requires_payment_method: 'failed',
  requires_confirmation: 'pending',
  requires_action: 'requires_action',
  requires_capture: 'pending',
  canceled: 'canceled',
};

export function mapPaymentIntent(pi: Stripe.PaymentIntent | Loose): Charge {
  const obj = pi as Loose;
  const lastError = obj.last_payment_error as Loose | null | undefined;
  const failed = obj.status === 'requires_payment_method' && lastError;
  return {
    id: obj.id,
    customerId: idOf(obj.customer) ?? '',
    tenantId: tenantOf(obj),
    amount: obj.amount ?? 0,
    amountRefunded: 0,
    currency: String(obj.currency ?? 'usd'),
    status: failed ? 'failed' : (PI_STATUS[obj.status] ?? 'pending'),
    description: obj.description ?? null,
    failureCode: lastError?.decline_code ?? lastError?.code ?? null,
    failureReason: lastError?.message ?? null,
    invoiceId: idOf(obj.invoice),
    metadata: metadataOf(obj),
  };
}

export function mapChargeObject(ch: Stripe.Charge | Loose): Charge {
  const obj = ch as Loose;
  return {
    id: idOf(obj.payment_intent) ?? obj.id,
    customerId: idOf(obj.customer) ?? '',
    tenantId: tenantOf(obj),
    amount: obj.amount ?? 0,
    amountRefunded: obj.amount_refunded ?? 0,
    currency: String(obj.currency ?? 'usd'),
    status: obj.status === 'succeeded' ? 'succeeded' : obj.status === 'failed' ? 'failed' : 'pending',
    description: obj.description ?? null,
    failureCode: obj.failure_code ?? null,
    failureReason: obj.failure_message ?? null,
    invoiceId: idOf(obj.invoice),
    metadata: metadataOf(obj),
  };
}

export function mapRefund(r: Stripe.Refund | Loose, fallbackChargeId?: string): Refund {
  const obj = r as Loose;
  return {
    id: obj.id,
    chargeId: idOf(obj.payment_intent) ?? idOf(obj.charge) ?? fallbackChargeId ?? '',
    tenantId: tenantOf(obj),
    amount: obj.amount ?? 0,
    currency: String(obj.currency ?? 'usd'),
    reason: obj.reason ?? null,
    status: (obj.status as Refund['status']) ?? 'pending',
  };
}

export function mapInvoice(i: Stripe.Invoice | Loose): Invoice {
  const obj = i as Loose;
  return {
    id: obj.id,
    customerId: idOf(obj.customer) ?? '',
    subscriptionId: idOf(obj.subscription) ?? idOf(obj.parent?.subscription_details?.subscription),
    tenantId: tenantOf(obj) ?? obj.subscription_details?.metadata?.tenantId ?? null,
    number: obj.number ?? null,
    amountDue: obj.amount_due ?? 0,
    amountPaid: obj.amount_paid ?? 0,
    currency: String(obj.currency ?? 'usd'),
    status: (obj.status as Invoice['status']) ?? 'open',
    hostedUrl: obj.hosted_invoice_url ?? null,
    pdfUrl: obj.invoice_pdf ?? null,
    periodStart: toDate(obj.period_start),
    periodEnd: toDate(obj.period_end),
    paidAt: toDate(obj.status_transitions?.paid_at),
  };
}

export function mapDispute(d: Stripe.Dispute | Loose): Dispute {
  const obj = d as Loose;
  return {
    id: obj.id,
    chargeId: idOf(obj.payment_intent) ?? idOf(obj.charge) ?? '',
    tenantId: tenantOf(obj),
    amount: obj.amount ?? 0,
    currency: String(obj.currency ?? 'usd'),
    reason: obj.reason ?? 'unknown',
    status: obj.status ?? 'needs_response',
    evidenceDueBy: toDate(obj.evidence_details?.due_by),
  };
}

export function mapPrice(p: Stripe.Price | Loose): Plan {
  const obj = p as Loose;
  const product = typeof obj.product === 'object' ? (obj.product as Loose) : null;
  return {
    id: obj.id,
    productId: idOf(obj.product) ?? '',
    name: obj.nickname ?? product?.name ?? obj.id,
    description: product?.description ?? null,
    amount: obj.unit_amount ?? 0,
    currency: String(obj.currency ?? 'usd'),
    interval: obj.recurring?.interval ?? null,
    active: Boolean(obj.active),
    metadata: metadataOf(obj),
  };
}

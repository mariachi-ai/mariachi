import type { WebhookEvent } from '../../types';
import type { WebhookHandlerContext } from '../webhook-types';

interface StripeDisputeData {
  id: string;
  charge: string;
  amount: number;
  currency: string;
  reason: string;
  status: string;
  evidence_details?: { due_by?: number };
}

export async function processDisputeCreated(event: WebhookEvent, ctx: WebhookHandlerContext): Promise<void> {
  const dispute = event.payload as StripeDisputeData;

  ctx.logger.warn(
    {
      disputeId: dispute.id,
      chargeId: dispute.charge,
      amount: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
      status: dispute.status,
      evidenceDueBy: dispute.evidence_details?.due_by,
    },
    'Processing charge.dispute.created webhook — requires immediate attention'
  );

  // TODO: Record dispute against the associated charge in billing_charges metadata
  // TODO: Emit high-priority domain event "billing.dispute.created"
  // TODO: Trigger urgent notification to operations/finance team
  // TODO: Freeze affected customer account pending dispute resolution if configured

  ctx.metrics?.increment('billing.webhook.dispute_created.synced', 1, { reason: dispute.reason });
  ctx.metrics?.histogram('billing.webhook.dispute_created.amount', dispute.amount, { currency: dispute.currency });
}

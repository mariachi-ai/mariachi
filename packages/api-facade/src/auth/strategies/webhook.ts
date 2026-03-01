import type { IncomingRequest } from '@mariachi/server';
import type { AuthStrategy, ResolvedIdentity } from '../../types';

export function WebhookStrategy(req: IncomingRequest): ResolvedIdentity | null {
  const signature = req.headers['x-webhook-signature'] ?? req.headers['x-signature'];
  if (typeof signature !== 'string' || !signature) return null;
  return {
    userId: 'webhook-service',
    tenantId: 'tenant-default',
    scopes: ['webhook'],
    identityType: 'webhook' as AuthStrategy,
  };
}

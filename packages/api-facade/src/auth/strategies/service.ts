import type { IncomingRequest } from '@mariachi/server';
import type { AuthStrategy, ResolvedIdentity } from '../../types';

export function ServiceStrategy(req: IncomingRequest): ResolvedIdentity | null {
  const token = req.headers['x-service-token'] ?? req.headers.authorization;
  if (typeof token !== 'string' || !token) return null;
  const value = token.startsWith('Bearer ') ? token.slice(7) : token;
  if (!value) return null;
  return {
    userId: 'service-account',
    tenantId: 'tenant-default',
    scopes: ['service'],
    identityType: 'service' as AuthStrategy,
  };
}

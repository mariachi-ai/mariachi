import type { IncomingRequest } from '@mariachi/server';
import type { AuthStrategy, ResolvedIdentity } from '../../types';

export function SessionStrategy(req: IncomingRequest): ResolvedIdentity | null {
  const auth = req.headers.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  if (!token) return null;
  return {
    userId: 'user-from-session',
    tenantId: 'tenant-default',
    scopes: ['read', 'write'],
    identityType: 'session' as AuthStrategy,
    sessionId: token.slice(0, 8),
  };
}

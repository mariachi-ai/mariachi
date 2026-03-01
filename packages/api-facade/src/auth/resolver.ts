import type { IncomingRequest } from '@mariachi/server';
import type { AuthStrategy, ResolvedIdentity } from '../types';
import { SessionStrategy } from './strategies/session';
import { ApiKeyStrategy } from './strategies/api-key';
import { WebhookStrategy } from './strategies/webhook';
import { ServiceStrategy } from './strategies/service';

const STRATEGIES: Record<AuthStrategy, (req: IncomingRequest) => ResolvedIdentity | null> = {
  session: SessionStrategy,
  'api-key': ApiKeyStrategy,
  webhook: WebhookStrategy,
  service: ServiceStrategy,
};

export function resolveAuth(req: IncomingRequest, strategies: AuthStrategy[]): ResolvedIdentity | null {
  for (const strategy of strategies) {
    const identity = STRATEGIES[strategy](req);
    if (identity) return identity;
  }
  return null;
}

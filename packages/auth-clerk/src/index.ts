export type { ClerkConfig } from './types';
export { ClerkAuthProvider } from './provider';
export { createClerkMiddleware } from './middleware';
export type { ClerkMiddlewareOptions } from './middleware';

export { ClerkWebhookHandler } from './webhooks/handler';
export { verifyClerkWebhook, extractSvixHeaders } from './webhooks/verify';
export type { SvixHeaders } from './webhooks/verify';

export { ClerkWebhookAuth } from './webhooks/auth';

export { ClerkWebhookController } from './webhooks/controller';
export type { ClerkWebhookControllerConfig } from './webhooks/controller';

export type {
  ClerkWebhookEvent,
  ClerkUserData,
  ClerkSessionData,
  ClerkOrganizationData,
  ClerkOrganizationMembershipData,
  ClerkUserEventType,
  ClerkSessionEventType,
  ClerkOrganizationEventType,
  ClerkOrganizationMembershipEventType,
  ClerkEmailEventType,
  ClerkEventType,
} from './webhooks/types';
export { CLERK_EVENT_TYPES } from './webhooks/types';

import type { ClerkConfig } from './types';
import { ClerkAuthProvider } from './provider';

export function createClerkAuth(config: ClerkConfig): ClerkAuthProvider {
  return new ClerkAuthProvider(config);
}

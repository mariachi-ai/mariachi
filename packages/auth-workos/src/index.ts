export type { AsymmetricAlgorithm, WorkOSConfig, WorkOSIdentityClientConfig, WorkOSJwtPayload } from './types';
export { WorkOSAuthProvider } from './provider';
export { WorkOSWebhookHandler, normalizeWorkOSEventType, computeWorkOSSignature } from './webhooks/handler';
export type { WorkOSWebhookHandlerConfig } from './webhooks/handler';
export { WorkOSIdentityClient } from './identity-client';

import type { WorkOSConfig, WorkOSIdentityClientConfig } from './types';
import { WorkOSAuthProvider } from './provider';
import { WorkOSIdentityClient } from './identity-client';

export function createWorkOSAuth(config: WorkOSConfig): WorkOSAuthProvider {
  return new WorkOSAuthProvider(config);
}

export function createWorkOSIdentityClient(config: WorkOSIdentityClientConfig): WorkOSIdentityClient {
  return new WorkOSIdentityClient(config);
}

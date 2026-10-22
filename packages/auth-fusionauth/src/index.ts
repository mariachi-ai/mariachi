export type { FusionAuthConfig } from './types';
export { FusionAuthAuthProvider } from './provider';
export { FusionAuthWebhookHandler } from './webhooks/handler';
export type { FusionAuthWebhookHandlerConfig } from './webhooks/handler';
export { FusionAuthIdentityClient, fusionAuthEmailVouched } from './identity-client';
export type { FusionAuthIdentityClientConfig, FusionAuthUser } from './identity-client';

import type { FusionAuthConfig } from './types';
import { FusionAuthAuthProvider } from './provider';
import { FusionAuthIdentityClient, type FusionAuthIdentityClientConfig } from './identity-client';

export function createFusionAuthAuth(config: FusionAuthConfig): FusionAuthAuthProvider {
  return new FusionAuthAuthProvider(config);
}

export function createFusionAuthIdentityClient(config: FusionAuthIdentityClientConfig): FusionAuthIdentityClient {
  return new FusionAuthIdentityClient(config);
}

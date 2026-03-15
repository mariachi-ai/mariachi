export type { FusionAuthConfig } from './types';
export { FusionAuthAuthProvider } from './provider';
export { FusionAuthWebhookHandler } from './webhooks/handler';
export type { FusionAuthWebhookHandlerConfig } from './webhooks/handler';

import type { FusionAuthConfig } from './types';
import { FusionAuthAuthProvider } from './provider';

export function createFusionAuthAuth(config: FusionAuthConfig): FusionAuthAuthProvider {
  return new FusionAuthAuthProvider(config);
}

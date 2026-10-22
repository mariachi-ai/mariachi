export type { AsymmetricAlgorithm, GoTrueAmrEntry, GoTrueConfig, GoTrueJwtPayload } from './types';
export { GoTrueAuthProvider } from './provider';
export { GoTrueWebhookHandler, normalizeGoTrueHook } from './webhooks/handler';
export type { GoTrueHookName, GoTrueWebhookHandlerConfig } from './webhooks/handler';
export {
  parseWebhookSecrets,
  signStandardWebhook,
  verifyStandardWebhook,
  WEBHOOK_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from './webhooks/standard-webhooks';

import type { GoTrueConfig } from './types';
import { GoTrueAuthProvider } from './provider';

export function createGoTrueAuth(config: GoTrueConfig): GoTrueAuthProvider {
  return new GoTrueAuthProvider(config);
}

import type { AuthController, WebhookContext } from '@mariachi/webhooks';
import { WebhookController } from '@mariachi/webhooks';
import { ClerkWebhookAuth } from './auth';
import type { ClerkWebhookEvent } from './types';

export interface ClerkWebhookControllerConfig {
  /** Svix signing secret from the Clerk dashboard */
  signingSecret: string;
  /**
   * Communication procedure name for the catch-all webhook handler.
   * The procedure receives `{ type, data }` and can route based on event type.
   * @default 'auth.clerk.webhook'
   */
  procedure?: string;
  /**
   * Called for every verified webhook event.
   * Return the transformed payload to be passed to the communication procedure.
   */
  transform?: (ctx: WebhookContext, event: ClerkWebhookEvent) => Promise<unknown>;
}

/**
 * Webhook controller for receiving Clerk webhooks via `@mariachi/webhooks` WebhookServer.
 *
 * Registers a single `POST /clerk/webhooks` route that dispatches all Clerk events
 * to a communication procedure. For per-event-type routing, use `createClerkWebhookHandler`
 * instead, which dispatches to individual procedures like `auth.clerk.user.created`.
 */
export class ClerkWebhookController extends WebhookController {
  readonly prefix = 'clerk';
  readonly auth: AuthController;
  private readonly procedure: string;
  private readonly transform?: (ctx: WebhookContext, event: ClerkWebhookEvent) => Promise<unknown>;

  constructor(config: ClerkWebhookControllerConfig) {
    super();
    this.auth = new ClerkWebhookAuth(config.signingSecret);
    this.procedure = config.procedure ?? 'auth.clerk.webhook';
    this.transform = config.transform;
  }

  init(): void {
    this.post(
      this.buildPath('webhooks'),
      { mode: 'direct', procedure: this.procedure },
      async (ctx, body) => {
        const event = body as ClerkWebhookEvent;
        if (this.transform) {
          return this.transform(ctx, event);
        }
        return { type: event.type, data: event.data };
      },
    );
  }
}

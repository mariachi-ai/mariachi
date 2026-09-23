import type { IncomingRequest, RequestContext } from '@mariachi/server';
import { AuthController } from './auth-controller';
import type { WebhookIdentity } from './auth-controller';

export abstract class OAuthAuthController extends AuthController {
  abstract readonly provider: string;

  protected readonly headerName: string = 'authorization';

  /** Return false, or the tenant id the token belongs to (true = no tenant). */
  protected abstract verifyToken(token: string, ctx: RequestContext): Promise<boolean | { tenantId: string }>;

  async auth(req: IncomingRequest, ctx: RequestContext): Promise<WebhookIdentity | null> {
    const header = req.headers[this.headerName];
    const value = typeof header === 'string' ? header : undefined;
    if (!value?.startsWith('Bearer ')) return null;
    const token = value.slice(7).trim();
    if (!token) return null;
    const verified = await this.verifyToken(token, ctx);
    if (!verified) return null;
    return {
      provider: this.provider,
      verified: true,
      tenantId: typeof verified === 'object' ? verified.tenantId : undefined,
      metadata: {},
    };
  }
}

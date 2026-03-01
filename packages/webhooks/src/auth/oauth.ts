import type { IncomingRequest, RequestContext } from '@mariachi/server';
import { AuthController } from './auth-controller';
import type { WebhookIdentity } from './auth-controller';

export abstract class OAuthAuthController extends AuthController {
  abstract readonly provider: string;

  protected readonly headerName: string = 'authorization';

  protected abstract verifyToken(token: string, ctx: RequestContext): Promise<boolean>;

  async auth(req: IncomingRequest, ctx: RequestContext): Promise<WebhookIdentity | null> {
    const header = req.headers[this.headerName];
    const value = typeof header === 'string' ? header : undefined;
    if (!value) return null;

    const token = value.startsWith('Bearer ') ? value.slice(7) : value;
    if (!token) return null;

    const verified = await this.verifyToken(token, ctx);
    if (!verified) return null;

    return {
      provider: this.provider,
      verified: true,
      metadata: { tokenPrefix: token.slice(0, 8) },
    };
  }
}

import type { IncomingRequest, RequestContext } from '@mariachi/server';
import { AuthController } from './auth-controller';
import type { WebhookIdentity } from './auth-controller';

export abstract class ApiKeyAuthController extends AuthController {
  abstract readonly provider: string;

  protected readonly headerName: string = 'x-api-key';

  /** Return false, or the tenant id the key belongs to (true = no tenant). Compare in constant time. */
  protected abstract verify(key: string, ctx: RequestContext): Promise<boolean | { tenantId: string }>;

  async auth(req: IncomingRequest, ctx: RequestContext): Promise<WebhookIdentity | null> {
    const header = req.headers[this.headerName];
    const key = typeof header === 'string' ? header : undefined;
    if (!key) return null;
    const verified = await this.verify(key, ctx);
    if (!verified) return null;
    return {
      provider: this.provider,
      verified: true,
      tenantId: typeof verified === 'object' ? verified.tenantId : undefined,
      metadata: { keyPrefix: key.slice(0, 6) },
    };
  }
}

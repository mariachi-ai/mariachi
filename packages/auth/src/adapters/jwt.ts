import jwt, { type SignOptions } from 'jsonwebtoken';
import type { AuthenticationAdapter, ResolvedIdentity } from '../types';

export class JWTAdapter implements AuthenticationAdapter {
  constructor(private readonly options: { secret: string }) {}

  async verify(token: string): Promise<ResolvedIdentity> {
    const decoded = jwt.verify(token, this.options.secret) as jwt.JwtPayload & {
      userId: string;
      tenantId: string;
      scopes?: string[];
      apiKeyId?: string;
      sessionId?: string;
    };
    return {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      scopes: decoded.scopes ?? [],
      identityType: 'session',
      apiKeyId: decoded.apiKeyId,
      sessionId: decoded.sessionId,
    };
  }

  async sign(
    payload: Omit<ResolvedIdentity, 'identityType'>,
    expiresIn: string | number = '24h',
  ): Promise<string> {
    return jwt.sign(
      {
        userId: payload.userId,
        tenantId: payload.tenantId,
        scopes: payload.scopes,
        apiKeyId: payload.apiKeyId,
        sessionId: payload.sessionId,
      },
      this.options.secret,
      { expiresIn } as SignOptions,
    );
  }
}

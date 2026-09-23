import jwt, { type Algorithm, type SignOptions, type VerifyOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { AuthError, ConfigError } from '@mariachi/core';
import type { AuthenticationAdapter, IdentityPayload, IdentityType, ResolvedIdentity } from '../types';

export interface JWTAdapterOptions {
  secret?: string;
  publicKey?: string;
  privateKey?: string;
  /** Allowed algorithms. Defaults to HS256 for secrets, RS256 for key pairs. Never mixes families. */
  algorithms?: Algorithm[];
  issuer?: string;
  audience?: string | string[];
  expiresIn?: string | number;
  clockToleranceSeconds?: number;
  identityType?: IdentityType;
}

const HMAC: Algorithm[] = ['HS256', 'HS384', 'HS512'];

const claimsSchema = z
  .object({
    sub: z.string().optional(),
    userId: z.string().optional(),
    tenantId: z.string().optional(),
    tid: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    scope: z.string().optional(),
    roles: z.array(z.string()).optional(),
    apiKeyId: z.string().optional(),
    sessionId: z.string().optional(),
    sid: z.string().optional(),
  })
  .passthrough();

export class JWTAdapter implements AuthenticationAdapter {
  private readonly algorithms: Algorithm[];
  private readonly verifyKey: string;
  private readonly signKey?: string;

  constructor(private readonly options: JWTAdapterOptions) {
    if (options.secret && options.publicKey) {
      throw new ConfigError('auth/jwt-config', 'Provide either secret or publicKey, not both');
    }
    if (options.secret) {
      if (options.secret.length < 32) {
        throw new ConfigError('auth/jwt-weak-secret', 'JWT secret must be at least 32 characters');
      }
      this.verifyKey = options.secret;
      this.signKey = options.secret;
      this.algorithms = options.algorithms ?? ['HS256'];
      if (this.algorithms.some((a) => !HMAC.includes(a))) {
        throw new ConfigError('auth/jwt-config', 'Secret-based JWTs only support HS256/HS384/HS512');
      }
    } else if (options.publicKey) {
      this.verifyKey = options.publicKey;
      this.signKey = options.privateKey;
      this.algorithms = options.algorithms ?? ['RS256'];
      if (this.algorithms.some((a) => HMAC.includes(a) || a === 'none')) {
        throw new ConfigError('auth/jwt-config', 'Key-pair JWTs cannot use HMAC or none algorithms');
      }
    } else {
      throw new ConfigError('auth/jwt-config', 'JWTAdapter requires secret or publicKey');
    }
  }

  async verify(token: string): Promise<ResolvedIdentity> {
    const opts: VerifyOptions = {
      algorithms: this.algorithms,
      issuer: this.options.issuer,
      audience: this.options.audience as VerifyOptions['audience'],
      clockTolerance: this.options.clockToleranceSeconds ?? 5,
    };
    let decoded: unknown;
    try {
      decoded = jwt.verify(token, this.verifyKey, opts);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) throw new AuthError('auth/token-expired', 'Token expired');
      throw new AuthError('auth/invalid-token', 'Invalid token', { reason: (error as Error).message });
    }
    const parsed = claimsSchema.safeParse(decoded);
    if (!parsed.success) throw new AuthError('auth/invalid-token', 'Invalid token claims');
    const c = parsed.data;
    const userId = c.userId ?? c.sub;
    const tenantId = c.tenantId ?? c.tid;
    if (!userId || !tenantId) throw new AuthError('auth/invalid-token', 'Token missing subject or tenant');
    return {
      userId,
      tenantId,
      scopes: c.scopes ?? (c.scope ? c.scope.split(' ').filter(Boolean) : []),
      roles: c.roles,
      identityType: this.options.identityType ?? 'session',
      apiKeyId: c.apiKeyId,
      sessionId: c.sessionId ?? c.sid,
      claims: c as Record<string, unknown>,
    };
  }

  async sign(payload: IdentityPayload, expiresIn?: string | number): Promise<string> {
    if (!this.signKey) throw new ConfigError('auth/jwt-config', 'Signing requires secret or privateKey');
    const options: SignOptions = {
      algorithm: this.algorithms[0],
      expiresIn: (expiresIn ?? this.options.expiresIn ?? '1h') as SignOptions['expiresIn'],
      subject: payload.userId,
      ...(this.options.issuer ? { issuer: this.options.issuer } : {}),
      ...(this.options.audience ? { audience: this.options.audience } : {}),
    };
    return jwt.sign(
      {
        userId: payload.userId,
        tenantId: payload.tenantId,
        scopes: payload.scopes,
        roles: payload.roles,
        apiKeyId: payload.apiKeyId,
        sessionId: payload.sessionId,
      },
      this.signKey,
      options,
    );
  }
}

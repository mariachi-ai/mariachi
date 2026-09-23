import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AuthError, MariachiError } from '@mariachi/core';
import type { IncomingRequest } from '@mariachi/server';
import type { AuthStrategyHandler, ResolvedIdentity } from '../types';

export interface TokenVerifier {
  verify(token: string): Promise<ResolvedIdentity>;
}

function header(req: IncomingRequest, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const ab = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function verifyOrThrow(verifier: TokenVerifier, token: string, code: string): Promise<ResolvedIdentity> {
  try {
    return await verifier.verify(token);
  } catch (error) {
    if (error instanceof MariachiError && error.code.startsWith('auth/')) throw error;
    throw new AuthError(code, 'Invalid credentials');
  }
}

/** `Authorization: Bearer <token>` verified by a JWT adapter, SessionManager, or auth provider. */
export function bearerStrategy(verifier: TokenVerifier, options: { cookie?: string } = {}): AuthStrategyHandler {
  return async (req) => {
    const auth = header(req, 'authorization');
    let token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
    if (!token && options.cookie) {
      const cookie = header(req, 'cookie');
      token = cookie
        ?.split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${options.cookie}=`))
        ?.slice(options.cookie.length + 1);
    }
    if (!token) return null;
    return verifyOrThrow(verifier, token, 'auth/invalid-token');
  };
}

/** `x-api-key: <key>` verified by `ApiKeyAdapter` (hash lookup). */
export function apiKeyStrategy(verifier: TokenVerifier, options: { header?: string } = {}): AuthStrategyHandler {
  const name = options.header ?? 'x-api-key';
  return async (req) => {
    const key = header(req, name);
    if (!key) return null;
    const identity = await verifyOrThrow(verifier, key, 'auth/invalid-api-key');
    return { ...identity, identityType: 'api-key' };
  };
}

export interface ServiceTokenOptions {
  /** service name → sha256 hex of its token (preferred) or the raw token. */
  tokens: Record<string, string>;
  header?: string;
  scopes?: string[] | ((service: string) => string[]);
  /** Header a service uses to select the tenant it acts in. Default `x-tenant-id`. */
  tenantHeader?: string;
}

/** Internal service-to-service calls with pre-shared tokens, compared in constant time. */
export function serviceTokenStrategy(options: ServiceTokenOptions): AuthStrategyHandler {
  const headerName = options.header ?? 'x-service-token';
  const entries = Object.entries(options.tokens).map(([service, value]) => ({
    service,
    hash: /^[a-f0-9]{64}$/.test(value) ? value : createHash('sha256').update(value).digest('hex'),
  }));
  return async (req) => {
    const token = header(req, headerName);
    if (!token) return null;
    const hash = createHash('sha256').update(token).digest('hex');
    const match = entries.find((e) => safeEqual(e.hash, hash));
    if (!match) throw new AuthError('auth/invalid-token', 'Invalid service token');
    const scopes = typeof options.scopes === 'function' ? options.scopes(match.service) : (options.scopes ?? ['service']);
    return {
      userId: `service:${match.service}`,
      tenantId: header(req, options.tenantHeader ?? 'x-tenant-id') ?? 'system',
      scopes,
      identityType: 'service',
    };
  };
}

export interface HmacSignatureOptions {
  secret: string | string[];
  header: string;
  algorithm?: 'sha256' | 'sha512' | 'sha1';
  encoding?: 'hex' | 'base64';
  /** Strip a prefix such as `sha256=`. */
  prefix?: string;
  provider: string;
  tenantId?: string | ((req: IncomingRequest) => string | undefined);
}

/** Generic HMAC webhook verification over the raw body. Supports secret rotation via arrays. */
export function hmacSignatureStrategy(options: HmacSignatureOptions): AuthStrategyHandler {
  const secrets = Array.isArray(options.secret) ? options.secret : [options.secret];
  return async (req) => {
    let sig = header(req, options.header);
    if (!sig) return null;
    if (!req.rawBody) throw new AuthError('auth/webhook-verification-failed', 'Raw body unavailable for signature check');
    if (options.prefix && sig.startsWith(options.prefix)) sig = sig.slice(options.prefix.length);
    const ok = secrets.some((secret) => {
      const expected = createHmac(options.algorithm ?? 'sha256', secret)
        .update(req.rawBody!)
        .digest(options.encoding ?? 'hex');
      return safeEqual(expected, sig!);
    });
    if (!ok) throw new AuthError('auth/webhook-verification-failed', 'Invalid webhook signature');
    const tenantId = typeof options.tenantId === 'function' ? options.tenantId(req) : options.tenantId;
    return { userId: `webhook:${options.provider}`, tenantId: tenantId ?? 'system', scopes: ['webhook'], identityType: 'webhook' };
  };
}

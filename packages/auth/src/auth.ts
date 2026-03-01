import type { Context, Logger, TracerAdapter, MetricsAdapter } from '@mariachi/core';
import { withSpan, getContainer, KEYS } from '@mariachi/core';
import type { Instrumentable } from '@mariachi/core';
import type { AuthenticationAdapter, AuthorizationAdapter, ResolvedIdentity } from './types';

export abstract class Auth implements Instrumentable {
  readonly logger: Logger;
  readonly tracer?: TracerAdapter;
  readonly metrics?: MetricsAdapter;
  protected readonly authentication: AuthenticationAdapter;
  protected readonly authorization: AuthorizationAdapter;

  constructor(config: { authentication: AuthenticationAdapter; authorization: AuthorizationAdapter }) {
    const container = getContainer();
    this.logger = container.resolve<Logger>(KEYS.Logger);
    this.tracer = container.has(KEYS.Tracer) ? container.resolve<TracerAdapter>(KEYS.Tracer) : undefined;
    this.metrics = container.has(KEYS.Metrics) ? container.resolve<MetricsAdapter>(KEYS.Metrics) : undefined;
    this.authentication = config.authentication;
    this.authorization = config.authorization;
  }

  async authenticate(ctx: Context, token: string): Promise<ResolvedIdentity> {
    return withSpan(this.tracer, 'auth.authenticate', { identityType: 'unknown' }, async (span) => {
      try {
        const identity = await this.authentication.verify(token);
        span?.setAttribute('identityType', identity.identityType);
        span?.setAttribute('userId', identity.userId);
        this.metrics?.increment('auth.authenticate.success', 1, { type: identity.identityType });
        this.logger.info({ traceId: ctx.traceId, userId: identity.userId, type: identity.identityType }, 'Authentication succeeded');
        return identity;
      } catch (error) {
        this.metrics?.increment('auth.authenticate.failure', 1);
        this.logger.warn({ traceId: ctx.traceId, error: (error as Error).message }, 'Authentication failed');
        await this.onAuthenticationFailed?.(ctx, error as Error);
        throw error;
      }
    });
  }

  async authorize(ctx: Context, action: string, resource: string): Promise<boolean> {
    return withSpan(this.tracer, 'auth.authorize', { action, resource }, async () => {
      if (!ctx.userId) return false;
      const identity: ResolvedIdentity = {
        userId: ctx.userId,
        tenantId: ctx.tenantId ?? '',
        scopes: ctx.scopes,
        identityType: ctx.identityType as ResolvedIdentity['identityType'],
      };
      const allowed = await this.authorization.can(identity, action, resource);
      this.metrics?.increment(allowed ? 'auth.authorize.allowed' : 'auth.authorize.denied', 1, { action, resource });
      return allowed;
    });
  }

  async sign(ctx: Context, payload: Omit<ResolvedIdentity, 'identityType'>, expiresIn?: string): Promise<string> {
    return withSpan(this.tracer, 'auth.sign', { userId: payload.userId }, async () => {
      return this.authentication.sign(payload, expiresIn);
    });
  }

  protected onAuthenticationFailed?(ctx: Context, error: Error): Promise<void>;
  protected onAuthorizationDenied?(ctx: Context, action: string, resource: string): Promise<void>;
}

export class DefaultAuth extends Auth {}

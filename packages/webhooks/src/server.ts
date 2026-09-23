import type { Context, IdempotencyStore, Logger } from '@mariachi/core';
import { AuthError, ConfigError, runOnce, runWithContext } from '@mariachi/core';
import { FastifyServerAdapter, contextFromRequest, httpResponse } from '@mariachi/server';
import type { ServerConfig, RequestContext, IncomingRequest, InjectOptions, InjectResponse } from '@mariachi/server';
import type { CommunicationLayer } from '@mariachi/communication';
import type { JobQueue } from '@mariachi/jobs';
import type { WebhookController } from './controller';
import type { WebhookLogStore } from './logging/types';
import type { WebhookContext, WebhookRouteDefinition } from './types';

export interface WebhookServerConfig extends ServerConfig {
  /** Default TTL for webhook logs when not specified on the route. */
  defaultTtl?: string;
  /** Extra header names to redact in logs (case-insensitive). */
  redactHeaders?: string[];
}

export interface WebhookServerDeps {
  communication?: CommunicationLayer;
  jobQueue?: JobQueue;
  logStore?: WebhookLogStore;
  /** Dedup deliveries by provider event id (`identity.eventId`). */
  idempotency?: IdempotencyStore;
  logger?: Logger;
}

const SENSITIVE_HEADER = /authorization|cookie|signature|secret|token|api-key|apikey|x-hub|svix-|stripe-/i;

export function redactHeaders(headers: IncomingRequest['headers'], extra: string[] = []): Record<string, string> {
  const extraSet = new Set(extra.map((h) => h.toLowerCase()));
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(headers)) {
    if (val === undefined) continue;
    const value = Array.isArray(val) ? val.join(', ') : String(val);
    out[key] = SENSITIVE_HEADER.test(key) || extraSet.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return out;
}

/**
 * Receives third-party webhooks: verifies them via the controller's `AuthController`, logs each
 * delivery (with secrets redacted), deduplicates by event id, then either calls a procedure
 * (`direct`, responds 200) or enqueues a job (`queue`, responds 202).
 */
export class WebhookServer {
  private readonly server: FastifyServerAdapter;
  private readonly config: WebhookServerConfig;
  private readonly deps: WebhookServerDeps;
  private readonly controllers: WebhookController[] = [];
  private built = false;

  constructor(config: WebhookServerConfig, deps: WebhookServerDeps) {
    this.config = config;
    this.deps = deps;
    this.server = new FastifyServerAdapter({ ...config, logger: config.logger ?? deps.logger });
  }

  registerController(controller: WebhookController): this {
    this.controllers.push(controller);
    return this;
  }

  private build(): void {
    if (this.built) return;
    this.built = true;
    for (const controller of this.controllers) {
      for (const route of controller.routes()) {
        if (route.opts.mode === 'direct' && !this.deps.communication) {
          throw new ConfigError('webhooks/missing-dependency', `Route ${route.path} needs deps.communication`);
        }
        if (route.opts.mode === 'queue' && !this.deps.jobQueue) {
          throw new ConfigError('webhooks/missing-dependency', `Route ${route.path} needs deps.jobQueue`);
        }
        this.server.register([
          { method: route.method, path: route.path, handler: (serverCtx, req) => this.handleRoute(controller, route, serverCtx, req) },
        ]);
      }
    }
  }

  async ready(): Promise<void> {
    this.build();
    await this.server.ready();
  }

  async listen(port: number, host?: string): Promise<string> {
    this.build();
    return this.server.listen(port, host);
  }

  async inject(options: InjectOptions): Promise<InjectResponse> {
    this.build();
    return this.server.inject(options);
  }

  async close(): Promise<void> {
    await this.server.close();
  }

  private async handleRoute(
    controller: WebhookController,
    route: WebhookRouteDefinition,
    serverCtx: RequestContext,
    req: IncomingRequest,
  ): Promise<unknown> {
    const identity = await controller.auth.auth(req, serverCtx);
    if (!identity) throw new AuthError('webhooks/unauthorized', 'Webhook authentication failed');

    const ctx: Context = contextFromRequest(
      serverCtx,
      { tenantId: identity.tenantId ?? null, scopes: ['webhook'], identityType: 'webhook' },
      { provider: identity.provider, eventId: identity.eventId },
    );
    const logger = ctx.logger;

    const process = () => runWithContext(ctx, () => this.process(route, serverCtx, req, identity, ctx));

    if (this.deps.idempotency && identity.eventId) {
      const outcome = await runOnce(this.deps.idempotency, `webhook:${identity.provider}:${identity.eventId}`, process);
      if (outcome.status !== 'processed') {
        logger.info({ status: outcome.status }, 'duplicate webhook delivery skipped');
        return httpResponse(200, { ok: true, duplicate: true });
      }
      return outcome.result;
    }
    return process();
  }

  private async process(
    route: WebhookRouteDefinition,
    serverCtx: RequestContext,
    req: IncomingRequest,
    identity: WebhookContext['identity'],
    ctx: Context,
  ): Promise<unknown> {
    const logStore = this.deps.logStore;
    const logId = logStore
      ? await logStore.log({
          route: route.path,
          controller: route.controllerPrefix,
          method: route.method,
          headers: redactHeaders(req.headers, this.config.redactHeaders),
          payload: route.opts.logPayload === false ? null : req.body,
          identity,
          status: 'received',
          ttl: route.opts.ttl ?? this.config.defaultTtl ?? '7d',
        })
      : undefined;

    const fail = async (err: unknown) => {
      if (logStore && logId) {
        await logStore.update(logId, { status: 'failed', error: err instanceof Error ? err.message : String(err) }).catch(() => undefined);
      }
    };

    const webhookCtx: WebhookContext = { ...serverCtx, logger: ctx.logger, identity };
    let payload: unknown;
    try {
      payload = await route.handler(webhookCtx, req.body, req.params, req.query);
    } catch (err) {
      await fail(err);
      throw err;
    }

    try {
      if (route.opts.mode === 'direct') {
        const result = await (this.deps.communication!.call as (c: Context, n: string, i: unknown) => Promise<unknown>)(
          ctx,
          route.opts.procedure!,
          payload,
        );
        if (logStore && logId) await logStore.update(logId, { status: 'processed', response: result ?? null });
        return { ok: true };
      }
      const jobId = await this.deps.jobQueue!.enqueue(route.opts.jobName!, payload, {
        jobId: identity.eventId ? `${identity.provider}:${identity.eventId}` : undefined,
        context: { traceId: ctx.traceId, tenantId: ctx.tenantId, userId: null, scopes: ctx.scopes, identityType: 'webhook' },
      });
      if (logStore && logId) await logStore.update(logId, { status: 'processed', response: { jobId } });
      return httpResponse(202, { ok: true, jobId });
    } catch (err) {
      await fail(err);
      throw err;
    }
  }
}

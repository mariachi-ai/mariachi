import type { Context } from '@mariachi/core';
import { createContext } from '@mariachi/core';
import { FastifyServerAdapter } from '@mariachi/server';
import type { ServerConfig, RequestContext, IncomingRequest } from '@mariachi/server';
import type { Communication } from '@mariachi/communication';
import type { JobQueue } from '@mariachi/jobs';
import type { WebhookController } from './controller';
import type { WebhookLogStore } from './logging/types';
import type { WebhookContext, WebhookRouteDefinition } from './types';

export interface WebhookServerConfig extends ServerConfig {
  /** Default TTL for webhook logs when not specified on the route. */
  defaultTtl?: string;
}

export interface WebhookServerDeps {
  communication: Communication;
  jobQueue: JobQueue;
  logStore: WebhookLogStore;
}

export class WebhookServer {
  private readonly server: FastifyServerAdapter;
  private readonly config: WebhookServerConfig;
  private readonly deps: WebhookServerDeps;
  private readonly controllers: WebhookController[] = [];

  constructor(config: WebhookServerConfig, deps: WebhookServerDeps) {
    this.config = config;
    this.deps = deps;
    this.server = new FastifyServerAdapter(config);
  }

  registerController(controller: WebhookController): this {
    this.controllers.push(controller);
    return this;
  }

  async listen(port: number): Promise<void> {
    for (const controller of this.controllers) {
      const routes = controller.routes();
      for (const route of routes) {
        this.server.register([{
          method: route.method,
          path: route.path,
          handler: (serverCtx, req) => this.handleRoute(controller, route, serverCtx, req),
        }]);
      }
    }

    await this.server.listen(port);
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
    if (!identity) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    }

    const ttl = route.opts.ttl ?? this.config.defaultTtl ?? '7d';
    const flatHeaders: Record<string, string> = {};
    for (const [key, val] of Object.entries(req.headers)) {
      if (typeof val === 'string') flatHeaders[key] = val;
      else if (Array.isArray(val)) flatHeaders[key] = val.join(', ');
    }

    const logId = await this.deps.logStore.log({
      route: route.path,
      controller: route.controllerPrefix,
      method: route.method,
      headers: flatHeaders,
      payload: req.body,
      identity,
      status: 'received',
      ttl,
    });

    const webhookCtx: WebhookContext = {
      traceId: serverCtx.traceId,
      logger: serverCtx.logger,
      server: serverCtx.server,
      identity,
    };

    let transformedPayload: unknown;
    try {
      transformedPayload = await route.handler(webhookCtx, req.body, req.params, req.query);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.deps.logStore.update(logId, { status: 'failed', error: message });
      throw err;
    }

    try {
      if (route.opts.mode === 'direct') {
        const procedure = route.opts.procedure;
        if (!procedure) throw new Error(`Route ${route.path} is mode 'direct' but has no procedure`);

        const ctx: Context = createContext({
          traceId: serverCtx.traceId,
          logger: serverCtx.logger,
          userId: null,
          tenantId: null,
          scopes: [],
          identityType: 'webhook',
          server: serverCtx.server,
        });
        await this.deps.communication.call(ctx, procedure, transformedPayload);
      } else {
        const jobName = route.opts.jobName;
        if (!jobName) throw new Error(`Route ${route.path} is mode 'queue' but has no jobName`);

        await this.deps.jobQueue.enqueue(jobName, transformedPayload, {
          traceId: serverCtx.traceId,
        });
      }

      await this.deps.logStore.update(logId, {
        status: 'processed',
        response: transformedPayload,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.deps.logStore.update(logId, { status: 'failed', error: message });
      throw err;
    }

    return { ok: true };
  }
}

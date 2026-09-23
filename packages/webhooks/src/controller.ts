import { ConfigError } from '@mariachi/core';
import { joinPath } from '@mariachi/server';
import type { AuthController } from './auth/auth-controller';
import type { WebhookRouteOpts, WebhookHandler, WebhookRouteDefinition, HttpMethod } from './types';

/** Groups webhook routes under `prefix`; paths passed to `post`/... are relative to it. */
export abstract class WebhookController {
  abstract readonly prefix: string;
  abstract readonly auth: AuthController;

  private _routes: WebhookRouteDefinition[] = [];
  private _initialized = false;

  abstract init(): void;

  protected post(path: string, opts: WebhookRouteOpts, handler: WebhookHandler): void {
    this.addRoute('POST', path, opts, handler);
  }

  protected get(path: string, opts: WebhookRouteOpts, handler: WebhookHandler): void {
    this.addRoute('GET', path, opts, handler);
  }

  protected put(path: string, opts: WebhookRouteOpts, handler: WebhookHandler): void {
    this.addRoute('PUT', path, opts, handler);
  }

  protected patch(path: string, opts: WebhookRouteOpts, handler: WebhookHandler): void {
    this.addRoute('PATCH', path, opts, handler);
  }

  protected delete(path: string, opts: WebhookRouteOpts, handler: WebhookHandler): void {
    this.addRoute('DELETE', path, opts, handler);
  }

  routes(): WebhookRouteDefinition[] {
    if (!this._initialized) {
      this.init();
      this._initialized = true;
    }
    return this._routes;
  }

  private addRoute(method: HttpMethod, path: string, opts: WebhookRouteOpts, handler: WebhookHandler): void {
    if (opts.mode === 'direct' && !opts.procedure) {
      throw new ConfigError('webhooks/invalid-route', `Webhook ${method} ${path} is 'direct' but has no procedure`);
    }
    if (opts.mode === 'queue' && !opts.jobName) {
      throw new ConfigError('webhooks/invalid-route', `Webhook ${method} ${path} is 'queue' but has no jobName`);
    }
    this._routes.push({ method, path: joinPath(this.prefix, path), opts, handler, controllerPrefix: this.prefix });
  }
}

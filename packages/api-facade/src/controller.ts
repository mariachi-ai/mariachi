import { ConfigError, type Context } from '@mariachi/core';
import type { CommunicationLayer } from '@mariachi/communication';
import { joinPath } from '@mariachi/server';
import type { RouteDefinition, RouteHandler, RouteOpts, RouteSchemas } from './types';

type Method = RouteDefinition['method'];

/**
 * Groups routes under `prefix`. Paths passed to `get`/`post`/... are relative to the prefix.
 * Controllers stay thin: validate with `schema`, then `this.call()` a communication procedure.
 */
export abstract class BaseController {
  /** Path segment(s) prepended to every route, e.g. `users` or `v1/users`. Use '' for none. */
  abstract readonly prefix: string;
  /** Default OpenAPI tags for this controller's routes. */
  readonly tags?: string[];

  private _routes: RouteDefinition[] = [];
  private _initialized = false;

  constructor(protected readonly communication?: CommunicationLayer) {}

  abstract init(): void;

  /** Calls a communication procedure with the request context. */
  protected call<T = unknown>(ctx: Context, procedure: string, input: unknown): Promise<T> {
    if (!this.communication) {
      throw new ConfigError('api/no-communication', `${this.constructor.name} was constructed without a communication layer`);
    }
    return (this.communication.call as (c: Context, n: string, i: unknown) => Promise<T>)(ctx, procedure, input);
  }

  protected get<S extends RouteSchemas>(path: string, handler: RouteHandler<S>): void;
  protected get<S extends RouteSchemas>(path: string, opts: RouteOpts<S>, handler: RouteHandler<S>): void;
  protected get(path: string, a: RouteOpts | RouteHandler, b?: RouteHandler): void {
    this.addRoute('GET', path, a, b);
  }

  protected post<S extends RouteSchemas>(path: string, handler: RouteHandler<S>): void;
  protected post<S extends RouteSchemas>(path: string, opts: RouteOpts<S>, handler: RouteHandler<S>): void;
  protected post(path: string, a: RouteOpts | RouteHandler, b?: RouteHandler): void {
    this.addRoute('POST', path, a, b);
  }

  protected put<S extends RouteSchemas>(path: string, handler: RouteHandler<S>): void;
  protected put<S extends RouteSchemas>(path: string, opts: RouteOpts<S>, handler: RouteHandler<S>): void;
  protected put(path: string, a: RouteOpts | RouteHandler, b?: RouteHandler): void {
    this.addRoute('PUT', path, a, b);
  }

  protected patch<S extends RouteSchemas>(path: string, handler: RouteHandler<S>): void;
  protected patch<S extends RouteSchemas>(path: string, opts: RouteOpts<S>, handler: RouteHandler<S>): void;
  protected patch(path: string, a: RouteOpts | RouteHandler, b?: RouteHandler): void {
    this.addRoute('PATCH', path, a, b);
  }

  protected delete<S extends RouteSchemas>(path: string, handler: RouteHandler<S>): void;
  protected delete<S extends RouteSchemas>(path: string, opts: RouteOpts<S>, handler: RouteHandler<S>): void;
  protected delete(path: string, a: RouteOpts | RouteHandler, b?: RouteHandler): void {
    this.addRoute('DELETE', path, a, b);
  }

  routes(): RouteDefinition[] {
    if (!this._initialized) {
      this.init();
      this._initialized = true;
    }
    return this._routes;
  }

  private addRoute(method: Method, path: string, a: RouteOpts | RouteHandler, b?: RouteHandler): void {
    const opts: RouteOpts = typeof a === 'function' ? {} : a;
    const handler = (typeof a === 'function' ? a : b) as RouteHandler | undefined;
    if (!handler) throw new ConfigError('api/missing-handler', `Route ${method} ${path} has no handler`);
    const fullPath = joinPath(this.prefix, path);
    if (this._routes.some((r) => r.method === method && r.path === fullPath)) {
      throw new ConfigError('api/duplicate-route', `Duplicate route ${method} ${fullPath}`);
    }
    this._routes.push({ ...opts, tags: opts.tags ?? this.tags, method, path: fullPath, handler });
  }
}

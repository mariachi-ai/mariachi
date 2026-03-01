import type { RouteDefinition, HttpContext, AuthStrategy } from './types';

export interface RouteOpts {
  auth?: AuthStrategy | AuthStrategy[] | false;
  rateLimit?: { maxRequests: number; windowMs: number };
}

export type RouteHandler = (
  ctx: HttpContext,
  body: unknown,
  params: Record<string, string>,
  query: Record<string, string>,
) => Promise<unknown>;

export abstract class BaseController {
  abstract readonly prefix: string;

  private _routes: RouteDefinition[] = [];
  private _initialized = false;

  abstract init(): void;

  protected post(path: string, handler: RouteHandler): void;
  protected post(path: string, opts: RouteOpts, handler: RouteHandler): void;
  protected post(path: string, optsOrHandler: RouteOpts | RouteHandler, handler?: RouteHandler): void {
    this.addRoute('POST', path, optsOrHandler, handler);
  }

  protected get(path: string, handler: RouteHandler): void;
  protected get(path: string, opts: RouteOpts, handler: RouteHandler): void;
  protected get(path: string, optsOrHandler: RouteOpts | RouteHandler, handler?: RouteHandler): void {
    this.addRoute('GET', path, optsOrHandler, handler);
  }

  protected put(path: string, handler: RouteHandler): void;
  protected put(path: string, opts: RouteOpts, handler: RouteHandler): void;
  protected put(path: string, optsOrHandler: RouteOpts | RouteHandler, handler?: RouteHandler): void {
    this.addRoute('PUT', path, optsOrHandler, handler);
  }

  protected patch(path: string, handler: RouteHandler): void;
  protected patch(path: string, opts: RouteOpts, handler: RouteHandler): void;
  protected patch(path: string, optsOrHandler: RouteOpts | RouteHandler, handler?: RouteHandler): void {
    this.addRoute('PATCH', path, optsOrHandler, handler);
  }

  protected delete(path: string, handler: RouteHandler): void;
  protected delete(path: string, opts: RouteOpts, handler: RouteHandler): void;
  protected delete(path: string, optsOrHandler: RouteOpts | RouteHandler, handler?: RouteHandler): void {
    this.addRoute('DELETE', path, optsOrHandler, handler);
  }

  protected buildPath(subpath?: string): string {
    const base = `/${this.prefix}`;
    if (!subpath) return base;
    return `${base}/${subpath}`;
  }

  routes(): RouteDefinition[] {
    if (!this._initialized) {
      this.init();
      this._initialized = true;
    }
    return this._routes;
  }

  private addRoute(
    method: RouteDefinition['method'],
    path: string,
    optsOrHandler: RouteOpts | RouteHandler,
    handler?: RouteHandler,
  ): void {
    const isHandler = typeof optsOrHandler === 'function';
    const opts: RouteOpts = isHandler ? {} : optsOrHandler as RouteOpts;
    const fn: RouteHandler = isHandler ? optsOrHandler as RouteHandler : handler!;

    this._routes.push({
      method,
      path,
      handler: fn,
      auth: opts.auth,
      rateLimit: opts.rateLimit,
    });
  }
}

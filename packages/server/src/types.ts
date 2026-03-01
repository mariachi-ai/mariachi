import type { Logger } from '@mariachi/core';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ServerConfig {
  name: string;
  prefix?: string;
  trustProxy?: boolean;
}

export interface RequestContext {
  traceId: string;
  logger: Logger;
  server: string;
}

export interface IncomingRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  params: Record<string, string>;
  query: Record<string, string>;
  method: string;
  url: string;
}

export interface ServerRoute {
  method: HttpMethod;
  path: string;
  handler: (ctx: RequestContext, req: IncomingRequest) => Promise<unknown>;
}

export type ServerMiddleware = (
  ctx: RequestContext,
  next: () => Promise<void>,
) => Promise<void>;

export interface ServerAdapter {
  withMiddleware(fn: ServerMiddleware): this;
  register(routes: ServerRoute[]): this;
  listen(port: number): Promise<void>;
  close(): Promise<void>;
}

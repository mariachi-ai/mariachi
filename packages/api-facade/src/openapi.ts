import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import type { AuthStrategy, OpenApiSettings, RouteDefinition } from './types';

type JsonSchema = Record<string, unknown>;

function toSchema(schema: z.ZodTypeAny): JsonSchema {
  const { $schema: _drop, ...rest } = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as JsonSchema;
  return rest;
}

function parameters(schema: z.ZodTypeAny | undefined, location: 'path' | 'query'): JsonSchema[] {
  if (!schema) return [];
  const json = toSchema(schema);
  const props = (json.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((json.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([name, s]) => ({
    name,
    in: location,
    required: location === 'path' ? true : required.has(name),
    schema: s,
    ...(s.description ? { description: s.description } : {}),
  }));
}

const SECURITY_SCHEMES: Record<string, JsonSchema> = {
  session: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
  'api-key': { type: 'apiKey', in: 'header', name: 'x-api-key' },
  service: { type: 'apiKey', in: 'header', name: 'x-service-token' },
};

const ERROR_ENVELOPE = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' }, traceId: { type: 'string' }, details: {} },
    },
  },
};

/** Builds an OpenAPI 3.0 document from route definitions and their Zod schemas. */
export function generateOpenApi(
  routes: RouteDefinition[],
  settings: OpenApiSettings,
  options: { prefix?: string; defaultAuth?: AuthStrategy[] } = {},
): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {};
  const usedSchemes = new Set<string>();
  const prefix = options.prefix ? `/${options.prefix.replace(/^\/+|\/+$/g, '')}` : '';

  for (const route of routes) {
    const path = `${prefix}${route.path}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}') || '/';
    const strategies =
      route.auth === false ? [] : route.auth ? (Array.isArray(route.auth) ? route.auth : [route.auth]) : (options.defaultAuth ?? []);
    const security = strategies.filter((s) => SECURITY_SCHEMES[s]).map((s) => ({ [s]: route.scopes ?? [] }));
    for (const s of strategies) if (SECURITY_SCHEMES[s]) usedSchemes.add(s);

    const status = String(route.status ?? 200);
    const errorResponse = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } };
    const op: JsonSchema = {
      operationId: `${route.method.toLowerCase()}${path.replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string) => (c ? c.toUpperCase() : ''))}`,
      ...(route.summary ? { summary: route.summary } : {}),
      ...(route.description ? { description: route.description } : {}),
      ...(route.tags ? { tags: route.tags } : {}),
      ...(route.deprecated ? { deprecated: true } : {}),
      parameters: [...parameters(route.schema?.params, 'path'), ...parameters(route.schema?.query, 'query')],
      ...(route.schema?.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: toSchema(route.schema.body) } } } }
        : {}),
      responses: {
        [status]: {
          description: 'Success',
          ...(route.schema?.response ? { content: { 'application/json': { schema: toSchema(route.schema.response) } } } : {}),
        },
        ...(route.schema?.body || route.schema?.query || route.schema?.params ? { '400': errorResponse } : {}),
        ...(strategies.length ? { '401': errorResponse, '403': errorResponse } : {}),
        '429': errorResponse,
        default: errorResponse,
      },
      ...(strategies.length ? { security } : { security: [] }),
    };
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = op;
  }

  return {
    openapi: '3.0.3',
    info: settings.info,
    ...(settings.servers ? { servers: settings.servers } : {}),
    paths,
    components: {
      schemas: { ErrorEnvelope: ERROR_ENVELOPE },
      securitySchemes: Object.fromEntries([...usedSchemes].map((s) => [s, SECURITY_SCHEMES[s]])),
    },
  };
}

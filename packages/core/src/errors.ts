export class MariachiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MariachiError';
  }
}

export class ConfigError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'ConfigError';
  }
}

export class DatabaseError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'DatabaseError';
  }
}

export class CacheError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'CacheError';
  }
}

export class AuthError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'AuthError';
  }
}

export class CommunicationError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'CommunicationError';
  }
}

export class BillingError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'BillingError';
  }
}

export class StorageError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'StorageError';
  }
}

export class NotificationError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'NotificationError';
  }
}

export class SearchError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'SearchError';
  }
}

export class EventsError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'EventsError';
  }
}

export class RealtimeError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'RealtimeError';
  }
}

export class JobsError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'JobsError';
  }
}

export class RateLimitError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'RateLimitError';
  }
}

export class TenancyError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'TenancyError';
  }
}

export class AuditError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'AuditError';
  }
}

export class AIError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'AIError';
  }
}

export class IntegrationError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'IntegrationError';
  }
}

export class EncryptionError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'EncryptionError';
  }
}

export class LifecycleError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'LifecycleError';
  }
}

export class ValidationError extends MariachiError {
  constructor(message: string, public readonly issues: ValidationIssue[] = [], metadata?: Record<string, unknown>) {
    super('validation/invalid-input', message, { ...metadata, issues });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends MariachiError {
  constructor(resource: string, id?: string, metadata?: Record<string, unknown>) {
    super('not-found', id ? `${resource} not found: ${id}` : `${resource} not found`, { ...metadata, resource, id });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends MariachiError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super('conflict', message, metadata);
    this.name = 'ConflictError';
  }
}

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
  code?: string;
}

/** Converts a ZodError (or anything with `.issues`) into a ValidationError. */
export function fromZodError(error: unknown, message = 'Invalid input'): ValidationError {
  const issues = (error as { issues?: Array<{ path: (string | number)[]; message: string; code?: string }> }).issues ?? [];
  return new ValidationError(
    message,
    issues.map((i) => ({ path: i.path, message: i.message, code: i.code })),
  );
}

export function isZodError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ZodError' && Array.isArray((error as { issues?: unknown }).issues);
}

/**
 * Most-specific code wins: exact codes first, then prefixes (longest first).
 * `<package>/not-found` style codes also map to 404, `<package>/conflict` to 409.
 */
const ERROR_CODE_TO_HTTP: Record<string, number> = {
  'auth/unauthorized': 401,
  'auth/forbidden': 403,
  'auth/token-expired': 401,
  'auth/invalid-token': 401,
  'auth/invalid-api-key': 401,
  'auth/invalid-credentials': 401,
  'auth/account-locked': 423,
  'auth/webhook-verification-failed': 401,
  'auth/oauth-state-mismatch': 400,
  'auth/oauth-pkce-missing': 400,
  'auth/webhook-invalid-payload': 400,
  'auth/session-expired': 401,
  'auth/invalid-session': 401,
  'auth/not-supported': 500,
  'auth/jwt-config': 500,
  'auth/jwt-weak-secret': 500,
  'auth/unknown-role': 400,
  'auth': 401,
  'http/invalid-json': 400,
  'http/payload-too-large': 413,
  'http/unsupported-media-type': 415,
  'http/not-found': 404,
  'http/method-not-allowed': 405,
  'webhooks/unauthorized': 401,
  'webhooks/invalid-payload': 400,
  'tenancy/missing-tenant': 400,
  'tenancy/mismatch': 403,
  'tenancy/suspended': 403,
  'rate-limit/exceeded': 429,
  'rate-limit/unknown-tier': 500,
  'rate-limit/backend-failed': 503,
  'rate-limit': 429,
  'not-found': 404,
  'validation/invalid-input': 400,
  'validation': 400,
  'billing/payment-failed': 402,
  'billing/insufficient-credits': 402,
  'billing/webhook-invalid-signature': 401,
  'billing/tenant-required': 400,
  'billing/idempotency-key-required': 400,
  'billing/idempotency-conflict': 409,
  'billing/subscription-exists': 409,
  'billing/rate-limited': 503,
  'billing/upstream-failed': 502,
  'billing/config': 500,
  'budget/exceeded': 402,
  'ai/token-budget-exceeded': 402,
  'storage/file-too-large': 413,
  'storage/invalid-mime-type': 415,
  'storage/invalid-key': 400,
  'storage/path-traversal': 400,
  'storage/invalid-signature': 403,
  'search/missing-query-fields': 400,
  'ai/request-failed': 502,
  'ai/providers-exhausted': 502,
  'integrations/invalid-output': 502,
  'integrations/invalid-signature': 401,
  'database/foreign-key-violation': 409,
  'database/serialization-failure': 409,
  'database/tenant-mismatch': 403,
  'database/timeout': 504,
  'database/unsafe-operation': 500,
  'database/tenant-required': 500,
  'communication/not-found': 500,
  'communication/timeout': 504,
  'integrations/upstream-failed': 502,
  'container': 500,
  'conflict': 409,
};

const SORTED_CODES = Object.keys(ERROR_CODE_TO_HTTP).sort((a, b) => b.length - a.length);

export function errorToHttpStatus(error: MariachiError): number {
  const code = error.code;
  if (code in ERROR_CODE_TO_HTTP) return ERROR_CODE_TO_HTTP[code];
  if (code.endsWith('/not-found') || code.endsWith('-not-found')) return 404;
  if (/[/-](conflict|duplicate|exists)$/.test(code)) return 409;
  if (code.endsWith('/invalid-input') || code.endsWith('/validation')) return 400;
  for (const prefix of SORTED_CODES) {
    if (code.startsWith(`${prefix}/`)) return ERROR_CODE_TO_HTTP[prefix];
  }
  return 500;
}

/** Standard JSON error body returned by every Mariachi HTTP server. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    traceId?: string;
    details?: unknown;
  };
}

/**
 * Builds the HTTP error envelope. 5xx messages are replaced with a generic one so
 * internal details never leak to clients.
 */
export function toErrorEnvelope(input: unknown, traceId?: string): { status: number; body: ErrorEnvelope } {
  const error = isZodError(input) ? fromZodError(input) : input;
  if (error instanceof MariachiError) {
    const status = errorToHttpStatus(error);
    const details = error instanceof ValidationError ? error.issues : undefined;
    return {
      status,
      body: {
        error: {
          code: error.code,
          message: status >= 500 ? 'Internal Server Error' : error.message,
          traceId,
          ...(details ? { details } : {}),
        },
      },
    };
  }
  const statusCode = (error as { statusCode?: number })?.statusCode;
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return {
      status: statusCode,
      body: { error: { code: `http/${statusCode}`, message: (error as Error).message, traceId } },
    };
  }
  return { status: 500, body: { error: { code: 'internal', message: 'Internal Server Error', traceId } } };
}

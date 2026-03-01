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

export class LifecycleError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'LifecycleError';
  }
}

const ERROR_CODE_TO_HTTP: Record<string, number> = {
  'auth/unauthorized': 401,
  'auth/forbidden': 403,
  'auth/token-expired': 401,
  'auth/invalid-token': 401,
  'auth/invalid-api-key': 401,
  'rate-limit/exceeded': 429,
  'not-found': 404,
  'validation/invalid-input': 400,
  'billing/payment-failed': 402,
  'conflict': 409,
};

export function errorToHttpStatus(error: MariachiError): number {
  for (const [prefix, status] of Object.entries(ERROR_CODE_TO_HTTP)) {
    if (error.code === prefix || error.code.startsWith(`${prefix}/`)) {
      return status;
    }
  }
  return 500;
}

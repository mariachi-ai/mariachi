import { MariachiError } from '@mariachi/core/errors';

/**
 * Thrown for invalid themes, design configs and CSS that references unknown tokens. Codes:
 * `design/invalid-theme`, `design/invalid-config`, `design/unknown-preset`, `design/unknown-component`,
 * `design/unknown-token`, `design/invalid-color`, `design/missing-asset`.
 */
export class DesignError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'DesignError';
  }
}

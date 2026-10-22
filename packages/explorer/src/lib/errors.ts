import { MariachiError } from '@mariachi/core/errors';

/**
 * Build-time failures: a loader got data of the wrong shape, a link can't be mapped to a route,
 * or a source file is missing. Codes: `explorer/invalid-data`, `explorer/unmapped-link`,
 * `explorer/missing-source`.
 */
export class ExplorerError extends MariachiError {
  constructor(code: string, message: string, metadata?: Record<string, unknown>) {
    super(code, message, metadata);
    this.name = 'ExplorerError';
  }
}

import type { ErrorTracker } from '../../types';

export class NoopErrorTracker implements ErrorTracker {
  captureException() {}
  captureMessage() {}
}

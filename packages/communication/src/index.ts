import { InProcessAdapter } from './adapters/in-process';
import { authMiddleware } from './middleware/auth';
import { loggerMiddleware } from './middleware/logger';
import { tracingMiddleware } from './middleware/tracing';
import type {
  CommunicationLayer,
  ProcedureContext,
  ProcedureDefinition,
} from './types';

export function createCommunication(): CommunicationLayer {
  return new InProcessAdapter();
}

export type { CommunicationLayer, ProcedureContext, ProcedureDefinition };
export { InProcessAdapter, authMiddleware, loggerMiddleware, tracingMiddleware };
export { Communication, DefaultCommunication } from './communication';

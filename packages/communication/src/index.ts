import type { InstrumentationDeps } from '@mariachi/core';
import { InProcessAdapter, type InProcessAdapterOptions } from './adapters/in-process';
import { DefaultCommunication, type Communication } from './communication';

export interface CreateCommunicationOptions extends InProcessAdapterOptions {
  adapter?: 'in-process';
}

/**
 * Creates the instrumented communication layer. Create ONE per process and share it through
 * the container (`KEYS.Communication`); a fresh instance has no handlers registered.
 */
export function createCommunication(options: CreateCommunicationOptions = {}, deps?: InstrumentationDeps): Communication {
  return new DefaultCommunication({ layer: new InProcessAdapter(options) }, deps);
}

export type {
  CommunicationLayer,
  ProcedureContext,
  ProcedureDefinition,
  Procedures,
  ProcedureName,
  ProcedureInput,
  ProcedureOutput,
  CallOptions,
  RegisterOptions,
} from './types';
export { defineProcedure } from './types';
export { InProcessAdapter, type InProcessAdapterOptions } from './adapters/in-process';
export { authMiddleware, type AuthMiddlewareOptions } from './middleware/auth';
export { loggerMiddleware } from './middleware/logger';
export { tracingMiddleware } from './middleware/tracing';
export { Communication, DefaultCommunication, type CommunicationConfig } from './communication';

export {
  type Context,
  type Logger,
  createContext,
} from './context';

export {
  runWithContext,
  currentContext,
  requireContext,
  runWithSlot,
  getSlot,
} from './context-store';

export {
  MariachiError,
  ConfigError,
  DatabaseError,
  CacheError,
  AuthError,
  CommunicationError,
  BillingError,
  StorageError,
  NotificationError,
  SearchError,
  EventsError,
  RealtimeError,
  JobsError,
  RateLimitError,
  TenancyError,
  AuditError,
  AIError,
  IntegrationError,
  EncryptionError,
  LifecycleError,
  ValidationError,
  NotFoundError,
  ConflictError,
  type ValidationIssue,
  type ErrorEnvelope,
  fromZodError,
  isZodError,
  errorToHttpStatus,
  toErrorEnvelope,
} from './errors';

export type {
  Handler,
  Middleware,
  HandlerRegistration,
  PaginationParams,
  PaginatedResult,
  CursorPaginationParams,
  CursorPaginatedResult,
  SortParams,
  Entity,
  BaseEntity,
  TenantEntity,
} from './types';

export {
  type Result,
  ok,
  err,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  flatMap,
  tryCatch,
} from './result';

export {
  type Container,
  type ServiceKey,
  type AnyKey,
  createContainer,
  createKey,
  getContainer,
  setContainer,
  KEYS,
} from './container';

export {
  type Span,
  type TracerAdapter,
  type MetricsAdapter,
  type Instrumentable,
  type InstrumentationDeps,
  type ResolvedInstrumentation,
  resolveInstrumentation,
  withSpan,
  timed,
} from './instrumentable';

export {
  type RetryConfig,
  DEFAULT_RETRY_CONFIG,
  computeRetryDelay,
  retry,
  withTimeout,
} from './retry';

export {
  type Disposable,
  isDisposable,
} from './disposable';

export { loadOptionalPeer } from './optional';

export { type IdempotencyStore, type IdempotencyClaim, InMemoryIdempotencyStore, runOnce } from './idempotency';

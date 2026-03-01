export { TestCacheClient } from './adapters/cache';
export { TestEventBus, type PublishedEvent } from './adapters/events';
export { TestJobQueue, type EnqueuedJob } from './adapters/jobs';
export { TestStorageClient } from './adapters/storage';
export { TestEmailAdapter } from './adapters/notifications';
export { TestRepository } from './adapters/database';
export { TestAISession } from './adapters/ai';

export { createTestUser, type TestUser } from './factories/user.factory';
export { createTestTenant, type TestTenant } from './factories/tenant.factory';
export { createTestContext } from './factories/context.factory';

export { TestLogger, createTestSetup, type LogEntry, type TestSetup } from './setup';

export { createTestHarness, type TestHarness } from './harness';

export type {
  CacheClient,
  EventBus,
  EventHandler,
  JobQueue,
  JobWorker,
  JobDefinition,
  StorageClient,
  PutOptions,
  EmailAdapter,
  EmailMessage,
  Repository,
  AIMessage,
  ToolCall,
  ToolResult,
  AIResponse,
  AISession,
  TypedEvent,
} from './types';
export type { Entity, BaseEntity, PaginatedResult, PaginationParams, SortParams, FilterOp, FilterCondition, QueryFilter } from './types';

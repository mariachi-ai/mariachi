export { TestCacheClient } from './adapters/cache';
export { TestLock } from './adapters/lock';
export { TestEventBus, type PublishedEvent } from './adapters/events';
export { TestJobQueue, type EnqueuedJob } from './adapters/jobs';
export { TestStorageClient } from './adapters/storage';
export { TestEmailAdapter, TestSMSAdapter, TestPushAdapter, TestInAppStore } from './adapters/notifications';
export { TestSearchClient } from './adapters/search';
export { TestRepository } from './adapters/database';
export { TestAISession } from './adapters/ai';

export { createTestUser, type TestUser } from './factories/user.factory';
export { createTestTenant, type TestTenant } from './factories/tenant.factory';
export { createTestContext } from './factories/context.factory';

export { TestLogger, createTestSetup, type LogEntry, type TestSetup } from './setup';

export { createTestHarness, TestHarnessLogger, type TestHarness } from './harness';
export { TestTracer, TestMetrics, type RecordedSpan, type RecordedMetric } from './adapters/observability';

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
  EventEnvelope,
} from './types';
export type { Entity, BaseEntity, PaginatedResult, PaginationParams, SortParams, FilterOp, FilterCondition, QueryFilter } from './types';

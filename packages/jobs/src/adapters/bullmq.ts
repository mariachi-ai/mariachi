import { Queue, Worker } from 'bullmq';
import type { Logger } from '@mariachi/core';
import type {
  JobConfig,
  JobQueue,
  JobWorker,
  JobScheduler,
  JobDefinition,
  ScheduleDefinition,
} from '../types';

const defaultConnection = { host: 'localhost', port: 6379 };

interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
}

function parseRedisUrl(url: string): RedisConnectionOptions {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
    };
  } catch {
    return defaultConnection;
  }
}

export class BullMQAdapter implements JobQueue, JobWorker, JobScheduler {
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private readonly jobDefinitions = new Map<string, JobDefinition>();
  private readonly schedules: ScheduleDefinition[] = [];
  private started = false;

  constructor(
    private readonly config: JobConfig,
    private readonly logger: Logger
  ) {}

  private getConnection() {
    const opts = this.config.redisUrl
      ? parseRedisUrl(this.config.redisUrl)
      : defaultConnection;
    return opts;
  }

  private getQueueName() {
    // BullMQ queue name cannot contain ':' — use hyphen so Redis key prefix stays separate
    return `${this.config.prefix ?? 'mariachi'}-jobs`;
  }

  async connect(): Promise<void> {
    if (this.queue) return;
    const connection = this.getConnection();
    this.queue = new Queue(this.getQueueName(), {
      connection,
      prefix: this.config.prefix ?? 'mariachi',
    });
  }

  async disconnect(): Promise<void> {
    await this.stop();
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }

  async enqueue<T>(
    jobName: string,
    data: T,
    options?: { delay?: number; priority?: number; traceId?: string }
  ): Promise<string> {
    await this.connect();
    if (!this.queue) throw new Error('Queue not initialized');
    const job = await this.queue.add(jobName, data as object, {
      delay: options?.delay,
      priority: options?.priority,
      traceId: options?.traceId,
    } as Record<string, unknown>);
    return job.id ?? '';
  }

  registerJob<T>(definition: JobDefinition<T>): void {
    this.jobDefinitions.set(definition.name, definition as JobDefinition);
  }

  register(schedule: ScheduleDefinition): void {
    this.schedules.push(schedule);
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.connect();
    if (!this.queue) throw new Error('Queue not initialized');

    const connection = this.getConnection();
    this.worker = new Worker(
      this.getQueueName(),
      async (job) => {
        const definition = this.jobDefinitions.get(job.name);
        if (!definition) {
          throw new Error(`Unknown job: ${job.name}`);
        }
        const parsed = definition.schema.safeParse(job.data);
        if (!parsed.success) {
          throw new Error(`Invalid job data: ${parsed.error.message}`);
        }
        const ctx = {
          logger: this.logger.child({
            jobId: job.id,
            jobName: job.name,
            attempt: job.attemptsMade + 1,
          }),
          traceId: (job.opts as Record<string, unknown>)?.traceId as string ?? crypto.randomUUID(),
          attemptNumber: job.attemptsMade + 1,
          jobId: job.id ?? '',
        };
        await definition.handler(parsed.data, ctx);
      },
      {
        connection,
        prefix: this.config.prefix ?? 'mariachi',
      }
    );

    for (const schedule of this.schedules) {
      await this.queue.add(schedule.jobName, schedule.data ?? {}, {
        repeat: { pattern: schedule.cron, key: schedule.name },
      });
    }

    this.started = true;
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    this.started = false;
  }
}

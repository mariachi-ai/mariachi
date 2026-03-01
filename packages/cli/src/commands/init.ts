import type { Command } from 'commander';
import { createProject } from '@mariachi/create';

const DEFAULT_MODE = 'monolith';
const DEFAULT_DB = 'postgres';
const DEFAULT_CACHE = 'redis';
const DEFAULT_QUEUE = 'bullmq';
const DEFAULT_AUTH = ['session'];
const DEFAULT_STORAGE = 's3';
const DEFAULT_EMAIL = 'resend';

export function registerInitCommand(program: Command): void {
  program
    .command('init <name>')
    .description('Initialize a new Mariachi project')
    .option('--mode <mode>', 'Project mode: monolith | microservice', DEFAULT_MODE)
    .option('--db <db>', 'Database adapter', DEFAULT_DB)
    .option('--cache <cache>', 'Cache adapter', DEFAULT_CACHE)
    .option('--queue <queue>', 'Queue adapter', DEFAULT_QUEUE)
    .option('--auth <auth>', 'Auth adapters (comma-separated)', (v: string) => v.split(',').map((s) => s.trim()))
    .option('--storage <storage>', 'Storage adapter', DEFAULT_STORAGE)
    .option('--email <email>', 'Email adapter', DEFAULT_EMAIL)
    .option('--features <features>', 'Features (comma-separated)', (v: string) => v.split(',').map((s) => s.trim()))
    .action(async (name: string, opts: {
      mode?: string;
      db?: string;
      cache?: string;
      queue?: string;
      auth?: string[];
      storage?: string;
      email?: string;
      features?: string[];
    }) => {
      const auth = opts.auth ?? DEFAULT_AUTH;
      const features = opts.features ?? [];
      await createProject({
        name,
        mode: (opts.mode as 'monolith' | 'microservice') ?? DEFAULT_MODE,
        adapters: {
          database: opts.db ?? DEFAULT_DB,
          cache: opts.cache ?? DEFAULT_CACHE,
          queue: opts.queue ?? DEFAULT_QUEUE,
          auth,
          storage: opts.storage ?? DEFAULT_STORAGE,
          email: opts.email ?? DEFAULT_EMAIL,
        },
        features,
        outputDir: `./${name}`,
      });
    });
}

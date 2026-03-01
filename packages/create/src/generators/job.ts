import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GenerateJobConfig } from '../types';

function toPascal(s: string): string {
  return s
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
}

function toKebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/[\s_]+/g, '-');
}

export async function generateJob(config: GenerateJobConfig): Promise<string[]> {
  const name = toKebab(config.name);
  const Name = toPascal(config.name);
  const jobsDir = join(config.projectRoot, 'apps', 'worker', 'jobs');
  await mkdir(jobsDir, { recursive: true });

  const content = `import { defineJob } from '@mariachi/jobs';
import { z } from 'zod';

const ${Name}JobSchema = z.object({ id: z.string() });

export const ${name}Job = defineJob({
  name: '${name}',
  schema: ${Name}JobSchema,
  retry: { attempts: 3, backoff: 'exponential' },
  handler: async (data, ctx) => {
    ctx.logger.info({ jobId: ctx.jobId }, 'Processing ${name} job');
  },
});
`;

  const jobPath = join(jobsDir, `${name}.job.ts`);
  await writeFile(jobPath, content);
  return [jobPath];
}

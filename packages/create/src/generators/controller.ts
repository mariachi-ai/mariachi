import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GenerateControllerConfig } from '../types';

function toPascal(s: string): string {
  return s
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
}

function toKebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/[\s_]+/g, '-');
}

export async function generateController(
  config: GenerateControllerConfig
): Promise<string[]> {
  const name = toKebab(config.name);
  const Name = toPascal(config.name);
  const controllerDir = join(config.projectRoot, 'apps', 'api', 'controllers');
  const controllerPath = join(controllerDir, `${name}.controller.ts`);

  const content = `import type { Context } from '@mariachi/core';
import { getContainer, KEYS } from '@mariachi/core';
import { z } from 'zod';

const ${Name}Request = z.object({ id: z.string() });
const ${Name}Response = z.object({ id: z.string() });

export const ${Name}Controller = {
  execute: async (ctx: Context, req: z.infer<typeof ${Name}Request>) => {
    const input = ${Name}Request.parse(req);
    const communication = getContainer().resolve(KEYS.Communication);
    return communication.call('${name}.execute', ctx, input);
  },
};
`;

  await writeFile(controllerPath, content);
  return [controllerPath];
}

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GenerateServiceConfig } from '../types';

function toPascal(s: string): string {
  return s
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
}

function toKebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/[\s_]+/g, '-');
}

export async function generateService(
  config: GenerateServiceConfig
): Promise<string[]> {
  const name = toKebab(config.name);
  const Name = toPascal(config.name);
  const serviceDir = join(config.projectRoot, 'apps', 'services', name);
  await mkdir(join(serviceDir, 'test'), { recursive: true });

  const serviceContent = `import type { Context } from '@mariachi/core';

export const ${Name}Service = {
  execute: async (ctx: Context, input: { id: string }) => {
    return { id: input.id };
  },
};
`;

  const handlerContent = `import type { Context } from '@mariachi/core';
import { z } from 'zod';
import { ${Name}Service } from './${name}.service';

const ${Name}Input = z.object({ id: z.string() });
const ${Name}Output = z.object({ id: z.string() });

export function register${Name}Handlers(communication: { register: Function }) {
  communication.register('${name}.execute', {
    schema: { input: ${Name}Input, output: ${Name}Output },
    handler: (ctx: Context, input: z.infer<typeof ${Name}Input>) =>
      ${Name}Service.execute(ctx, input),
  });
}
`;

  const testContent = `import { describe, it, expect } from 'vitest';
import { createTestContext } from '@mariachi/testing';
import { ${Name}Service } from './${name}.service';

describe('${Name}Service', () => {
  it('executes', async () => {
    const ctx = createTestContext();
    const result = await ${Name}Service.execute(ctx, { id: '1' });
    expect(result).toEqual({ id: '1' });
  });
});
`;

  const servicePath = join(serviceDir, `${name}.service.ts`);
  const handlerPath = join(serviceDir, `${name}.handler.ts`);
  const testPath = join(serviceDir, 'test', `${name}.service.test.ts`);

  await writeFile(servicePath, serviceContent);
  await writeFile(handlerPath, handlerContent);
  await writeFile(testPath, testContent);

  return [servicePath, handlerPath, testPath];
}

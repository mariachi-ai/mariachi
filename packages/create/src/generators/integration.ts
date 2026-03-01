import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GenerateIntegrationConfig } from '../types';

function toPascal(s: string): string {
  return s
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
}

function toKebab(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/[\s_]+/g, '-');
}

export async function generateIntegration(
  config: GenerateIntegrationConfig
): Promise<string[]> {
  const name = toKebab(config.name);
  const Name = toPascal(config.name);
  const integrationDir = join(config.projectRoot, 'integrations', name);
  await mkdir(integrationDir, { recursive: true });

  const indexContent = `import { defineIntegrationFn } from '@mariachi/integrations';
import { z } from 'zod';
import { getCredentials } from './credentials';
import { createClient } from './client';

const InputSchema = z.object({});
const OutputSchema = z.object({});

export const ${name}Integration = defineIntegrationFn({
  name: '${name}',
  input: InputSchema,
  output: OutputSchema,
  handler: async (input, ctx) => {
    const creds = getCredentials(ctx);
    const client = createClient(creds);
    return {} as z.infer<typeof OutputSchema>;
  },
});
`;

  const credentialsContent = `import { z } from 'zod';
import type { IntegrationContext } from '@mariachi/integrations';

export const ${Name}CredentialsSchema = z.object({
  apiKey: z.string(),
});

export type ${Name}Credentials = z.infer<typeof ${Name}CredentialsSchema>;

export function getCredentials(ctx: IntegrationContext): ${Name}Credentials {
  return ${Name}CredentialsSchema.parse({});
}
`;

  const typesContent = `export interface ${Name}Config {
  apiKey: string;
}
`;

  const clientContent = `import type { ${Name}Credentials } from './credentials';

export function createClient(creds: ${Name}Credentials) {
  return {
    request: async (path: string) => {
      return { path };
    },
  };
}
`;

  const testContent = `import { describe, it, expect } from 'vitest';
import { ${name}Integration } from './index';

describe('${Name}Integration', () => {
  it('runs', async () => {
    const result = await ${name}Integration({}, {} as any);
    expect(result).toEqual({});
  });
});
`;

  const indexPath = join(integrationDir, 'index.ts');
  const credentialsPath = join(integrationDir, 'credentials.ts');
  const typesPath = join(integrationDir, 'types.ts');
  const clientPath = join(integrationDir, 'client.ts');
  const testPath = join(integrationDir, 'test.ts');

  await writeFile(indexPath, indexContent);
  await writeFile(credentialsPath, credentialsContent);
  await writeFile(typesPath, typesContent);
  await writeFile(clientPath, clientContent);
  await writeFile(testPath, testContent);

  return [indexPath, credentialsPath, typesPath, clientPath, testPath];
}

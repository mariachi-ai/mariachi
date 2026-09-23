import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { names } from './names';
import { validate } from './validate/index';

describe('names', () => {
  it('derives every casing from kebab, camel or pascal input', () => {
    for (const input of ['invoice-item', 'invoiceItem', 'InvoiceItem', 'invoice_item']) {
      expect(names(input)).toEqual({
        kebab: 'invoice-item',
        pascal: 'InvoiceItem',
        camel: 'invoiceItem',
        pluralKebab: 'invoice-items',
        pluralPascal: 'InvoiceItems',
        pluralCamel: 'invoiceItems',
        pluralSnake: 'invoice_items',
      });
    }
  });

  it('pluralizes common endings', () => {
    expect(names('category').pluralKebab).toBe('categories');
    expect(names('address').pluralKebab).toBe('addresses');
    expect(names('key').pluralKebab).toBe('keys');
  });

  it('rejects names that cannot become identifiers', () => {
    expect(() => names('1st')).toThrow(/Invalid name/);
    expect(() => names('../etc')).toThrow(/Invalid name/);
  });
});

describe('validate', () => {
  let root: string;
  afterEach(() => rm(root, { recursive: true, force: true }));

  async function project(files: Record<string, string>) {
    root = await mkdtemp(join(tmpdir(), 'mariachi-validate-'));
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), content);
    }
    return validate(root);
  }

  const rules = (r: Awaited<ReturnType<typeof validate>>) => r.violations.map((v) => `${v.rule}@${v.file}:${v.line ?? '-'}`);

  it('enforces layer boundaries', async () => {
    const result = await project({
      'src/api/controllers/users.controller.ts': [
        "import { BaseController } from '@mariachi/api-facade';",
        "import { UsersService } from '../../services/users/users.service';",
        "import { eq } from 'drizzle-orm';",
      ].join('\n'),
      'src/services/users/users.service.ts': "import Fastify from 'fastify';\nexport class UsersService {}",
      'src/services/users/users.handler.ts': 'export {};',
      'src/services/users/users.service.test.ts': 'export {};',
    });
    expect(rules(result)).toEqual([
      'no-service-import-in-controller@src/api/controllers/users.controller.ts:2',
      'no-db-in-controller@src/api/controllers/users.controller.ts:3',
      'no-http-in-service@src/services/users/users.service.ts:1',
    ]);
    expect(result.valid).toBe(false);
  });

  it('checks conventions and honors ignore comments', async () => {
    const result = await project({
      'src/lib/a.ts': [
        "import { b } from './b.js';", // mariachi-lint-ignore: fixture for the extensionless-imports rule
        "import { x } from '@mariachi/core/src/errors';",
        'const port = process.env.PORT;',
        "throw new Error('boom');",
        '// mariachi-validate-ignore no-raw-error',
        "throw new Error('allowed');",
        "// throw new Error('in a comment');",
      ].join('\n'),
      'src/config.ts': 'export const url = process.env.DATABASE_URL;',
      'vitest.config.ts': 'export default { env: process.env };',
    });
    expect(rules(result)).toEqual([
      'extensionless-imports@src/lib/a.ts:1',
      'no-deep-imports@src/lib/a.ts:2',
      'no-process-env@src/lib/a.ts:3',
      'no-raw-error@src/lib/a.ts:4',
    ]);
  });

  it('reports duplicate procedures, missing handlers/tests and bad event names', async () => {
    const result = await project({
      'src/services/a/a.service.ts': "export class A {}\nevents.publish(ctx, 'UserCreated', {});",
      'src/services/a/a.handler.ts': "communication.register('users.create', def);",
      'src/services/b/b.handler.ts': "\ncommunication.register('users.create', def);",
      'src/services/c/c.service.ts': 'export class C {}',
      'src/services/c/c.service.test.ts': 'export {};',
    });
    expect(result.violations.map((v) => [v.rule, v.severity, v.file, v.line])).toEqual([
      ['test-for-every-service', 'warning', 'src/services/a/a.service.ts', undefined],
      ['event-name-format', 'warning', 'src/services/a/a.service.ts', 2],
      ['unique-procedure-names', 'error', 'src/services/b/b.handler.ts', 2],
      ['handler-for-every-service', 'warning', 'src/services/c/c.service.ts', undefined],
    ]);
  });
});

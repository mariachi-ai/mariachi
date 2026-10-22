import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerInitCommand } from './init';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mariachi-init-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

async function init(...args: string[]) {
  const program = new Command().exitOverride();
  registerInitCommand(program);
  await program.parseAsync(['node', 'mariachi', 'init', ...args]);
}

describe('mariachi init --auth', () => {
  it('defaults to the JWT template', async () => {
    await init(join(dir, 'app'), '--no-example');
    const pkg = JSON.parse(await readFile(join(dir, 'app/package.json'), 'utf-8'));
    expect(pkg.dependencies['@mariachi/auth-gotrue']).toBeUndefined();
    expect(existsSync(join(dir, 'app/ensemble.environment.json'))).toBe(false);
  });

  it('generates the Ensemble login template with --auth ensemble', async () => {
    await init(join(dir, 'app'), '--no-example', '--auth', 'ensemble');
    const pkg = JSON.parse(await readFile(join(dir, 'app/package.json'), 'utf-8'));
    expect(pkg.dependencies).toHaveProperty('@mariachi/auth-gotrue');
    expect(pkg.dependencies).toHaveProperty('@mariachi/tenancy');
    expect(existsSync(join(dir, 'app/ensemble.environment.json'))).toBe(true);
    expect(existsSync(join(dir, 'app/seed/users.yaml'))).toBe(true);
  });

  it('refuses an unknown provider', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit ${code}`); // mariachi-lint-ignore: stands in for process.exit in the test
    }) as never);
    await expect(init(join(dir, 'app'), '--auth', 'clerk')).rejects.toThrow('exit 1');
    expect(exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown auth "clerk"'));
  });
});

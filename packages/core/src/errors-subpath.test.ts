import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `@mariachi/core/errors` is imported by browser-safe packages (@mariachi/design), so it must not
// pull in Node built-ins or any other module.
describe('@mariachi/core/errors', () => {
  it('has no imports', () => {
    const src = fs.readFileSync(path.join(__dirname, 'errors.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/require\(/);
  });

  it('exports MariachiError and its subclasses', async () => {
    const mod = await import('./errors');
    const err = new mod.ConfigError('config/x', 'bad');
    expect(err).toBeInstanceOf(mod.MariachiError);
    expect(err.code).toBe('config/x');
  });
});

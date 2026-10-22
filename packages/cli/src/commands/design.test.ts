import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildDesign, checkTheme, defineDesign } from '@mariachi/design/build';
import { describe, expect, it } from 'vitest';
import { loadDesignConfig, themeTemplate } from './design';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mariachi-design-cli-'));

describe('loadDesignConfig', () => {
  it('loads the default export of mariachi.design.ts', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'mariachi.design.ts'), "export default { base: 'minimal', include: ['button'] } as const;\n");
    const { file, config } = await loadDesignConfig(dir);
    expect(file).toBe(path.join(dir, 'mariachi.design.ts'));
    expect(defineDesign(config as never).components).toEqual(['button']);
  });

  it('fails clearly when there is no config', async () => {
    await expect(loadDesignConfig(tmp())).rejects.toThrow(/No design config found/);
  });
});

describe('themeTemplate', () => {
  it('scaffolds a theme that extends the preset and passes contrast', async () => {
    const dir = tmp();
    const design = path.dirname(require.resolve('@mariachi/design/package.json'));
    const source = themeTemplate('acme-dark', 'brutalist').replace("from '@mariachi/design'", `from '${path.join(design, 'dist', 'index.js')}'`);
    fs.writeFileSync(path.join(dir, 'acme.theme.ts'), source);
    fs.writeFileSync(path.join(dir, 'mariachi.design.ts'), "import { acmeDark } from './acme.theme';\nexport default { base: acmeDark };\n");
    const { config } = await loadDesignConfig(dir);
    const result = await buildDesign(config as never, { cwd: dir });
    expect(result.design.base.name).toBe('acme-dark');
    expect(result.design.base.extends).toBe('brutalist');
    expect(checkTheme(result.design.theme).ok).toBe(true);
  });
});

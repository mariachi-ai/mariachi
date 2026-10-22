import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { namespaceHtml } from '../src/lib/examples';
import { fromRoot } from '../src/lib/repo';
import { samples } from '../src/samples';

// Sample pages are built only from @mariachi/design: every m- class they use must exist in its CSS.
const css = fs.readFileSync(fromRoot('packages/design/dist/css/mariachi.css'), 'utf8');

describe.each(samples.map((s) => [s.name, s] as const))('sample %s', (_name, sample) => {
  it('uses only classes the design library defines', () => {
    const classes = new Set([...sample.html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith('m-')));
    const missing = [...classes].filter((c) => !new RegExp(`\\.${c}(?![a-z0-9-])`).test(css));
    expect(missing).toEqual([]);
  });

  it('has no duplicate ids', () => {
    const ids = [...sample.html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('namespaceHtml', () => {
  it('suffixes ids and every attribute that references them', () => {
    const html = '<label for="a">A</label><input id="a" name="r" aria-describedby="a b"><a href="#a">x</a><a href="#other">y</a>';
    expect(namespaceHtml(html, 'p1')).toBe(
      '<label for="a-p1">A</label><input id="a-p1" name="r-p1" aria-describedby="a-p1 b"><a href="#a-p1">x</a><a href="#other">y</a>',
    );
  });
});

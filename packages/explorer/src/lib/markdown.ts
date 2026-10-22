import fs from 'node:fs';
import path from 'node:path';
import rehypeShiki from '@shikijs/rehype';
import type { Element, Root as HastRoot } from 'hast';
import { toString as hastToString } from 'hast-util-to-string';
import type { Code, Link, Root as MdastRoot } from 'mdast';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { createCssVariablesTheme } from 'shiki';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { VFile } from 'vfile';
import type { Heading } from '../data/schema';
import { ExplorerError } from './errors';
import { relative, repoRoot, sourceUrl } from './repo';
import { href } from './url';

/** Maps an absolute file path (and optional hash) to an explorer route, or undefined. */
export type LinkResolver = (absolutePath: string) => string | undefined;

export interface RenderedMarkdown {
  title: string | undefined;
  summary: string;
  html: string;
  headings: Heading[];
}

interface FileData {
  sourcePath: string;
  resolve: LinkResolver;
  title?: string;
  summary?: string;
  headings?: Heading[];
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Rewrites relative links to explorer routes (or GitHub for source files) and pre-renders Mermaid. */
function remarkMariachi() {
  return (tree: MdastRoot, file: VFile) => {
    const data = file.data as unknown as FileData;
    visit(tree, 'link', (node: Link) => {
      const url = node.url;
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('#') || url.startsWith('//')) return;
      const [target, hash] = url.split('#');
      const absolute = path.resolve(path.dirname(data.sourcePath), decodeURIComponent(target));
      const route = data.resolve(absolute);
      if (route) {
        node.url = href(route) + (hash ? `#${hash}` : '');
      } else if (fs.existsSync(absolute) && absolute.startsWith(repoRoot())) {
        node.url = sourceUrl(relative(absolute)) + (hash ? `#${hash}` : '');
      } else {
        throw new ExplorerError('explorer/unmapped-link', `${relative(data.sourcePath)}: link to ${url} matches no route or file`, {
          file: data.sourcePath,
          url,
        });
      }
    });
    visit(tree, 'code', (node: Code, index, parent) => {
      if (node.lang !== 'mermaid' || !parent || index === undefined) return;
      parent.children[index] = { type: 'html', value: `<pre class="mermaid">${escapeHtml(node.value)}</pre>` };
    });
  };
}

/** Takes the first h1 as the title (removed from the body), the first paragraph as the summary, and collects h2/h3. */
function rehypeOutline() {
  return (tree: HastRoot, file: VFile) => {
    const data = file.data as unknown as FileData;
    const headings: Heading[] = [];
    visit(tree, 'element', (node: Element, index, parent) => {
      const depth = /^h([1-6])$/.exec(node.tagName)?.[1];
      if (depth === '1' && data.title === undefined && parent && index !== undefined) {
        data.title = hastToString(node).trim();
        parent.children.splice(index, 1);
        return index;
      }
      if (depth && (depth === '2' || depth === '3')) {
        headings.push({ depth: Number(depth), id: String(node.properties?.id ?? ''), text: hastToString(node).trim() });
      }
      if (node.tagName === 'p' && data.summary === undefined) data.summary = hastToString(node).trim();
      if (node.tagName === 'table' && parent && index !== undefined) {
        // A focusable region so keyboard users can scroll wide tables (WCAG 2.1.1).
        parent.children[index] = {
          type: 'element',
          tagName: 'div',
          properties: { className: ['m-table-wrap'], tabIndex: 0, role: 'region', ariaLabel: 'Table' },
          children: [node],
        };
      }
      if (node.tagName === 'input' && node.properties?.type === 'checkbox' && parent && 'tagName' in parent) {
        // GFM task-list checkboxes: name them after their item.
        node.properties.ariaLabel = hastToString(parent).trim();
      }
      return undefined;
    });
    data.headings = headings;
  };
}

const theme = createCssVariablesTheme({ name: 'mariachi', variablePrefix: '--shiki-', fontStyle: true });

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMariachi)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeSlug)
  .use(rehypeOutline)
  .use(rehypeShiki, {
    theme,
    langs: ['ts', 'tsx', 'js', 'json', 'bash', 'sh', 'css', 'html', 'yaml', 'sql', 'diff', 'md'],
    fallbackLanguage: 'text',
    defaultLanguage: 'text',
    transformers: [
      {
        pre(node) {
          this.addClassToHast(node, 'm-code');
          // The design library's .m-code paints the background; drop Shiki's inline style.
          node.properties.style = undefined;
        },
      },
    ],
  })
  .use(rehypeStringify, { allowDangerousHtml: true });

/** Renders a markdown string. `sourcePath` is the absolute file it came from (links resolve against it). */
export async function renderMarkdown(markdown: string, sourcePath: string, resolve: LinkResolver): Promise<RenderedMarkdown> {
  const file = new VFile({ value: markdown, data: { sourcePath, resolve } as unknown as VFile['data'] });
  const result = await processor.process(file);
  const data = result.data as unknown as FileData;
  return { title: data.title, summary: data.summary ?? '', html: String(result), headings: data.headings ?? [] };
}

/** Highlights one code snippet as `.m-code` HTML (API signatures, examples). */
export async function highlight(code: string, lang: string): Promise<string> {
  const { codeToHtml } = await import('shiki');
  return codeToHtml(code, {
    lang,
    theme,
    transformers: [
      {
        pre(node) {
          this.addClassToHast(node, 'm-code');
          node.properties.style = undefined;
        },
      },
    ],
  });
}

/**
 * Runs on every page: design-library behaviours, the preset and mode switchers, Cmd-K search over
 * the Pagefind index, and lazily rendered Mermaid diagrams that follow the current theme.
 */
import { enhance } from '@mariachi/design/behaviors';

const root = document.documentElement;
const base = document.body.dataset.base ?? '/';
const STORAGE_KEY = 'mariachi-explorer';

enhance();

// ---------------------------------------------------------------------------------------------
// Preset and mode.

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: root.dataset.theme, mode: root.dataset.mode }));
  } catch {
    // Private windows and blocked storage: the choice just doesn't persist.
  }
}

const themeSelect = document.querySelector<HTMLSelectElement>('#x-theme');
const modeSelect = document.querySelector<HTMLSelectElement>('#x-mode');
if (themeSelect) themeSelect.value = root.dataset.theme ?? 'minimal';
if (modeSelect) modeSelect.value = root.dataset.mode ?? 'auto';
themeSelect?.addEventListener('change', () => {
  root.dataset.theme = themeSelect.value;
  save();
  document.dispatchEvent(new CustomEvent('mariachi:theme'));
});
modeSelect?.addEventListener('change', () => {
  root.dataset.mode = modeSelect.value;
  save();
  document.dispatchEvent(new CustomEvent('mariachi:theme'));
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => document.dispatchEvent(new CustomEvent('mariachi:theme')));

// ---------------------------------------------------------------------------------------------
// Search (Pagefind; built after `astro build`, so absent in dev).

interface PagefindResult {
  url: string;
  excerpt: string;
  meta: { title?: string };
  sub_results?: { url: string; title: string; excerpt: string }[];
}
interface Pagefind {
  search(query: string): Promise<{ results: { data(): Promise<PagefindResult> }[] }>;
}

const dialog = document.querySelector<HTMLDialogElement>('#x-search');
const input = document.querySelector<HTMLInputElement>('#x-search-input');
const results = document.querySelector<HTMLElement>('#x-search-results');
let pagefind: Promise<Pagefind | null> | undefined;

function loadPagefind(): Promise<Pagefind | null> {
  pagefind ??= import(/* @vite-ignore */ `${base}pagefind/pagefind.js`).catch(() => null);
  return pagefind;
}

function openSearch(): void {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  input?.select();
  void loadPagefind();
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

let searchToken = 0;
async function runSearch(query: string): Promise<void> {
  if (!results) return;
  const token = ++searchToken;
  if (query.trim() === '') {
    results.innerHTML = '';
    return;
  }
  const pf = await loadPagefind();
  if (token !== searchToken) return;
  if (!pf) {
    results.innerHTML = '<p class="m-muted x-search-empty">Search is built with the site (pnpm --filter @mariachi/explorer build).</p>';
    return;
  }
  const found = await pf.search(query);
  const data = await Promise.all(found.results.slice(0, 12).map((r) => r.data()));
  if (token !== searchToken) return;
  results.innerHTML = data.length
    ? `<ul class="x-search-list">${data
        .map((d) => {
          const sub = d.sub_results?.[0];
          const url = sub && sub.url !== d.url ? sub.url : d.url;
          const heading = sub && sub.title !== d.meta.title ? ` <span class="m-subtle">› ${escapeHtml(sub.title)}</span>` : '';
          return `<li><a class="x-search-hit" href="${escapeHtml(url)}"><span class="x-search-title">${escapeHtml(d.meta.title ?? url)}${heading}</span><span class="x-search-excerpt">${sub?.excerpt ?? d.excerpt}</span></a></li>`;
        })
        .join('')}</ul>`
    : `<p class="m-muted x-search-empty">No results for “${escapeHtml(query)}”.</p>`;
}

document.querySelector('#x-search-open')?.addEventListener('click', openSearch);
document.addEventListener('keydown', (event) => {
  const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
    event.preventDefault();
    openSearch();
  }
});
let debounce: ReturnType<typeof setTimeout> | undefined;
input?.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => void runSearch(input.value), 120);
});
input?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    results?.querySelector<HTMLElement>('a')?.focus();
  }
});
results?.addEventListener('keydown', (event) => {
  const links = [...(results?.querySelectorAll<HTMLElement>('a') ?? [])];
  const i = links.indexOf(document.activeElement as HTMLElement);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? i + 1 : i - 1;
    if (next < 0) input?.focus();
    else links[Math.min(next, links.length - 1)]?.focus();
  }
});

// ---------------------------------------------------------------------------------------------
// Mermaid, themed from the live design tokens and re-rendered when the theme changes.

const diagrams = [...document.querySelectorAll<HTMLElement>('pre.mermaid')];
if (diagrams.length > 0) {
  for (const d of diagrams) d.dataset.source = d.textContent ?? '';
  const render = async () => {
    const [{ default: mermaid }, { parseColor, toHex }] = await Promise.all([import('mermaid'), import('@mariachi/design')]);
    const probe = document.createElement('span');
    document.body.append(probe);
    const token = (name: string) => {
      probe.style.color = `var(${name})`;
      const parsed = parseColor(getComputedStyle(probe).color);
      return parsed ? toHex(parsed) : undefined;
    };
    const font = getComputedStyle(document.body).fontFamily;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      securityLevel: 'strict',
      fontFamily: font,
      themeVariables: {
        background: token('--m-color-bg-canvas'),
        primaryColor: token('--m-color-bg-surface'),
        primaryTextColor: token('--m-color-fg-default'),
        primaryBorderColor: token('--m-color-border-strong'),
        secondaryColor: token('--m-color-accent-subtle'),
        tertiaryColor: token('--m-color-bg-sunken'),
        lineColor: token('--m-color-fg-muted'),
        textColor: token('--m-color-fg-default'),
        clusterBkg: token('--m-color-bg-sunken'),
        clusterBorder: token('--m-color-border-default'),
        edgeLabelBackground: token('--m-color-bg-surface'),
        fontFamily: font,
      },
    });
    probe.remove();
    for (const d of diagrams) {
      d.removeAttribute('data-processed');
      d.textContent = d.dataset.source ?? '';
    }
    await mermaid.run({ nodes: diagrams });
  };
  void render();
  document.addEventListener('mariachi:theme', () => void render());
}

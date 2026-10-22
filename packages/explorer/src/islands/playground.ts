/**
 * The design playground: edits token values on top of a preset, renders the preview with the
 * merged theme under data-theme="x-playground", re-checks contrast, and emits the override CSS and
 * config. Everything runs on @mariachi/design's browser-safe entry, the same code `buildDesign` uses.
 */
import {
  applyOverrides,
  checkTheme,
  emitOverridesCss,
  emitTokensCss,
  formatContrastFailure,
  presets,
  type Theme,
  type TokenOverrideValue,
  tokenList,
} from '@mariachi/design';
import { namespaceHtml } from '../lib/examples';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const baseSelect = $<HTMLSelectElement>('#pg-base');
const scopeSelect = $<HTMLSelectElement>('#pg-scope');
const filter = $<HTMLInputElement>('#pg-filter');
const list = $<HTMLElement>('#pg-tokens');
const stage = $<HTMLElement>('#pg-stage');
const previewSelect = $<HTMLSelectElement>('#pg-preview');
const contrast = $<HTMLElement>('#pg-contrast');
const cssOut = $<HTMLElement>('#pg-css');
const configOut = $<HTMLElement>('#pg-config');
const changedLabel = $<HTMLElement>('#pg-changed');
const style = document.createElement('style');
document.head.append(style);

const allPresets = presets as Record<string, Theme>;
let overrides: Record<string, { light?: string; dark?: string } | string> = {};

// ---------------------------------------------------------------------------------------------
// State in the URL hash: #base=minimal&o=<base64url JSON>.

function readHash(): void {
  const params = new URLSearchParams(location.hash.slice(1));
  const base = params.get('base');
  if (base && allPresets[base]) baseSelect.value = base;
  try {
    const raw = params.get('o');
    if (raw) overrides = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    overrides = {};
  }
}

function writeHash(): void {
  const params = new URLSearchParams({ base: baseSelect.value });
  if (Object.keys(overrides).length) params.set('o', btoa(JSON.stringify(overrides)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  history.replaceState(null, '', `#${params}`);
}

// ---------------------------------------------------------------------------------------------
// Theme computation.

const base = () => allPresets[baseSelect.value];
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function merged(): Theme {
  return { ...base(), name: 'x-playground', tokens: applyOverrides(base().tokens, overrides as Record<string, TokenOverrideValue>) };
}

function currentValue(path: string, mode: 'light' | 'dark'): string {
  const t = merged().tokens[path] ?? tokenList.find((x) => x.path === path)?.def.default ?? '';
  return typeof t === 'string' ? t : t[mode];
}

/** `{ 'color.accent.default': v }` → `{ color: { accent: { default: v } } }`. */
function nest(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let node = out;
    for (const p of parts.slice(0, -1)) {
      node[p] ??= {};
      node = node[p] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

function toTs(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent + 1);
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  const entries = Object.entries(value as Record<string, unknown>);
  const key = (k: string) => (/^[a-zA-Z_$][\w$]*$/.test(k) ? k : `'${k}'`);
  return `{\n${entries.map(([k, v]) => `${pad}${key(k)}: ${toTs(v, indent + 1)},`).join('\n')}\n${'  '.repeat(indent)}}`;
}

// ---------------------------------------------------------------------------------------------
// Rendering.

function update(): void {
  const theme = merged();
  style.textContent = emitTokensCss(theme.tokens, 'x-playground', 'mariachi.theme');
  const changed = Object.keys(overrides).length;
  changedLabel.textContent = changed ? `${changed} token${changed === 1 ? '' : 's'} changed` : 'No changes';

  const check = checkTheme(theme);
  contrast.dataset.tone = check.ok ? 'success' : 'danger';
  contrast.innerHTML = '';
  const content = document.createElement('div');
  content.className = 'm-alert-content';
  const title = document.createElement('div');
  title.className = 'm-alert-title';
  title.textContent = check.ok ? `All ${check.results.length} contrast checks pass` : `${check.failures.length} contrast check${check.failures.length === 1 ? '' : 's'} fail`;
  content.append(title);
  if (!check.ok) {
    const body = document.createElement('ul');
    body.className = 'm-alert-body';
    for (const f of check.failures.slice(0, 8)) {
      const li = document.createElement('li');
      li.textContent = formatContrastFailure(f);
      body.append(li);
    }
    content.append(body);
  }
  contrast.append(content);

  const css = emitOverridesCss(base(), { ...theme, name: base().name });
  cssOut.textContent = css || '/* No changes yet: edit a token on the left. */';
  const semantic = Object.fromEntries(Object.entries(overrides).filter(([p]) => !p.startsWith('components.')));
  const components = Object.fromEntries(Object.entries(overrides).filter(([p]) => p.startsWith('components.')).map(([p, v]) => [p.slice('components.'.length), v]));
  const config: Record<string, unknown> = { base: baseSelect.value };
  if (Object.keys(semantic).length) config.tokens = nest(semantic);
  if (Object.keys(components).length) config.components = nest(components);
  configOut.textContent = `import { defineDesign } from '@mariachi/design';\n\nexport default defineDesign(${toTs(config)});\n`;
  for (const row of list.querySelectorAll<HTMLElement>('[data-path]')) row.toggleAttribute('data-changed', row.dataset.path! in overrides);
  writeHash();
}

function setOverride(path: string, mode: 'light' | 'dark' | 'both', value: string): void {
  const baseValue = base().tokens[path] ?? tokenList.find((t) => t.path === path)?.def.default;
  const existing = overrides[path];
  if (mode === 'both') {
    overrides[path] = value;
  } else {
    const prev = typeof existing === 'object' ? existing : existing ? { light: existing, dark: existing } : {};
    overrides[path] = { ...prev, [mode]: value };
  }
  // Drop overrides that match the base again.
  const o = overrides[path];
  const same = (m: 'light' | 'dark') => {
    const b = typeof baseValue === 'object' ? baseValue[m] : baseValue;
    const v = typeof o === 'object' ? (o[m] ?? b) : o;
    return v === b;
  };
  if (same('light') && same('dark')) delete overrides[path];
  update();
}

const toHexIfPossible = async (value: string): Promise<string | undefined> => {
  const { parseColor, toHex } = await import('@mariachi/design');
  const parsed = parseColor(value);
  return parsed ? toHex(parsed) : undefined;
};

function input(path: string, mode: 'light' | 'dark' | 'both', label: string, isColor: boolean): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'x-token-input';
  const id = `pg-${path.replace(/\W/g, '-')}-${mode}`;
  const text = document.createElement('input');
  text.className = 'm-input';
  text.dataset.size = 'sm';
  text.id = id;
  text.value = currentValue(path, mode === 'both' ? 'light' : mode);
  text.setAttribute('aria-label', `${path} ${label}`);
  text.addEventListener('change', () => setOverride(path, mode, text.value.trim()));
  wrap.append(text);
  if (isColor) {
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'x-token-picker';
    picker.setAttribute('aria-label', `Pick ${path} ${label}`);
    void toHexIfPossible(text.value).then((hex) => {
      if (hex) picker.value = hex;
    });
    picker.addEventListener('input', () => {
      text.value = picker.value;
      setOverride(path, mode, picker.value);
    });
    wrap.prepend(picker);
  }
  return wrap;
}

function renderList(): void {
  const scope = scopeSelect.value;
  const query = filter.value.trim().toLowerCase();
  const prefix = scope === 'semantic' ? undefined : `components.${camel(scope)}.`;
  const tokens = tokenList.filter((t) => (prefix ? t.path.startsWith(prefix) : !t.path.startsWith('components.')) && (!query || t.path.toLowerCase().includes(query)));
  list.replaceChildren(
    ...tokens.map((t) => {
      const row = document.createElement('div');
      row.className = 'x-token-row';
      row.dataset.path = t.path;
      const name = document.createElement('div');
      name.className = 'x-token-name';
      name.innerHTML = `<code class="m-code-inline"></code><span class="m-subtle"></span>`;
      name.querySelector('code')!.textContent = prefix ? t.path.slice(prefix.length) : t.path;
      name.querySelector('span')!.textContent = t.def.description;
      row.append(name);
      const raw = merged().tokens[t.path];
      const perMode = t.def.kind === 'color' || typeof raw === 'object';
      if (perMode) {
        row.append(input(t.path, 'light', 'light', t.def.kind === 'color'), input(t.path, 'dark', 'dark', t.def.kind === 'color'));
      } else {
        row.append(input(t.path, 'both', '', false));
      }
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'm-button x-token-reset';
      reset.dataset.size = 'sm';
      reset.dataset.variant = 'ghost';
      reset.textContent = 'Reset';
      reset.addEventListener('click', () => {
        delete overrides[t.path];
        renderList();
        update();
      });
      row.append(reset);
      row.toggleAttribute('data-changed', t.path in overrides);
      return row;
    }),
  );
}

function renderPreview(): void {
  const template = document.querySelector<HTMLTemplateElement>(`template[data-x-item="${CSS.escape(previewSelect.value)}"]`);
  stage.innerHTML = namespaceHtml(template?.innerHTML ?? '', 'pg');
}

// ---------------------------------------------------------------------------------------------
// Wiring.

readHash();
baseSelect.addEventListener('change', () => {
  renderList();
  update();
});
scopeSelect.addEventListener('change', renderList);
filter.addEventListener('input', renderList);
previewSelect.addEventListener('change', renderPreview);
$('#pg-reset').addEventListener('click', () => {
  overrides = {};
  renderList();
  update();
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-pg-mode]')) {
  button.addEventListener('click', () => {
    stage.dataset.mode = button.dataset.pgMode;
    for (const b of document.querySelectorAll('[data-pg-mode]')) b.setAttribute('aria-pressed', String(b === button));
  });
}
renderList();
renderPreview();
update();

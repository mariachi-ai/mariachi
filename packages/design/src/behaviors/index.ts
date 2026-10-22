/**
 * @mariachi/design/behaviors: optional, dependency-free progressive enhancement for markup that
 * needs JavaScript beyond native HTML. Every behaviour is delegated from one root, so markup added
 * later works without re-initialising. Nothing here is required: without it, tabs show their first
 * panel, dialogs open with your own code, and so on.
 *
 * ```ts
 * import { enhance, toast } from '@mariachi/design/behaviors';
 * const stop = enhance(); // document by default
 * toast({ title: 'Saved', tone: 'success' });
 * ```
 */

type Root = Document | HTMLElement;

const tabsOf = (list: Element) => [...list.querySelectorAll<HTMLElement>('[role="tab"]')].filter((t) => t.closest('[role="tablist"]') === list);

function selectTab(tab: HTMLElement, focus: boolean): void {
  const list = tab.closest('[role="tablist"]');
  if (!list) return;
  for (const t of tabsOf(list)) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    const panelId = t.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel) panel.hidden = !selected;
  }
  if (focus) tab.focus();
}

function onTabKey(event: KeyboardEvent, tab: HTMLElement): void {
  const list = tab.closest('[role="tablist"]');
  if (!list) return;
  const tabs = tabsOf(list).filter((t) => t.getAttribute('aria-disabled') !== 'true');
  const vertical = list.getAttribute('aria-orientation') === 'vertical';
  const i = tabs.indexOf(tab);
  const keys: Record<string, number> = {
    [vertical ? 'ArrowDown' : 'ArrowRight']: i + 1,
    [vertical ? 'ArrowUp' : 'ArrowLeft']: i - 1,
    Home: 0,
    End: tabs.length - 1,
  };
  if (!(event.key in keys)) return;
  event.preventDefault();
  selectTab(tabs[(keys[event.key] + tabs.length) % tabs.length], true);
}

function onMenuKey(event: KeyboardEvent, item: HTMLElement): void {
  const menu = item.closest('[role="menu"]');
  if (!menu) return;
  const items = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"]):not(:disabled)')];
  const i = items.indexOf(item);
  const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  items[(next + items.length) % items.length]?.focus();
}

async function copy(trigger: HTMLElement): Promise<void> {
  const value = trigger.dataset.mCopy ?? '';
  const source = value.startsWith('#') ? document.querySelector(value) : null;
  const text = source ? (source.textContent ?? '') : value;
  try {
    await navigator.clipboard.writeText(text);
    trigger.dataset.copied = 'true';
    setTimeout(() => delete trigger.dataset.copied, 1500);
  } catch {
    trigger.dataset.copied = 'false';
  }
}

function autogrow(el: HTMLTextAreaElement): void {
  if (CSS.supports('field-sizing', 'content')) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Wires up, within `root`:
 * - tabs (`[role=tab]` in `[role=tablist]`): click and arrow/Home/End keys, toggling `aria-selected` and panels via `aria-controls`
 * - menus (`[role=menu]`): arrow/Home/End focus movement
 * - dialogs: `[data-m-dialog-open="<id>"]` calls `showModal()`, `[data-m-dialog-close]` closes the nearest dialog,
 *   and `dialog[data-m-light-dismiss]` closes on a backdrop click
 * - `[data-m-copy="text or #id"]`: copies to the clipboard and sets `data-copied` for 1.5s
 * - `[data-m-toast-close]`: removes its toast
 * - `textarea[data-m-autogrow]` and `.m-composer-input`: grow with content where `field-sizing` isn't supported
 *
 * Returns a function that removes the listeners.
 */
export function enhance(root: Root = document): () => void {
  const onClick = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest) return;
    const tab = target.closest<HTMLElement>('[role="tab"]');
    if (tab && tab.getAttribute('aria-disabled') !== 'true') selectTab(tab, false);
    const opener = target.closest<HTMLElement>('[data-m-dialog-open]');
    if (opener) (document.getElementById(opener.dataset.mDialogOpen ?? '') as HTMLDialogElement | null)?.showModal();
    const closer = target.closest<HTMLElement>('[data-m-dialog-close]');
    if (closer) closer.closest('dialog')?.close();
    if (target instanceof HTMLDialogElement && target.hasAttribute('data-m-light-dismiss')) {
      const r = target.getBoundingClientRect();
      const e = event as MouseEvent;
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) target.close();
    }
    const copier = target.closest<HTMLElement>('[data-m-copy]');
    if (copier) void copy(copier);
    const toastClose = target.closest<HTMLElement>('[data-m-toast-close]');
    if (toastClose) dismiss(toastClose.closest<HTMLElement>('.m-toast'));
  };
  const onKey = (event: Event) => {
    const e = event as KeyboardEvent;
    const target = e.target as HTMLElement | null;
    if (!target?.closest) return;
    const tab = target.closest<HTMLElement>('[role="tab"]');
    if (tab) onTabKey(e, tab);
    const item = target.closest<HTMLElement>('[role^="menuitem"]');
    if (item) onMenuKey(e, item);
  };
  const onInput = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && (target.hasAttribute('data-m-autogrow') || target.classList.contains('m-composer-input'))) {
      autogrow(target);
    }
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('input', onInput);
  // Roving tabindex for tablists already in the DOM.
  for (const list of root.querySelectorAll('[role="tablist"]')) {
    const tabs = tabsOf(list);
    const selected = tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0];
    for (const t of tabs) t.tabIndex = t === selected ? 0 : -1;
  }
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
    root.removeEventListener('input', onInput);
  };
}

export interface ToastOptions {
  title: string;
  body?: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  /** Milliseconds before it dismisses itself; 0 keeps it until closed. Default 5000. Paused while hovered or focused. */
  timeout?: number;
  /** The region to add to. Default: the first `.m-toast-region`, created on `document.body` if missing. */
  region?: HTMLElement;
}

function dismiss(el: HTMLElement | null): void {
  if (!el) return;
  el.dataset.state = 'closing';
  const duration = Number.parseFloat(getComputedStyle(el).animationDuration || '0') * 1000;
  setTimeout(() => el.remove(), Number.isFinite(duration) ? duration : 0);
}

/** Shows a `.m-toast` and returns a function that dismisses it. */
export function toast(options: ToastOptions): () => void {
  let region = options.region ?? document.querySelector<HTMLElement>('.m-toast-region');
  if (!region) {
    region = document.createElement('section');
    region.className = 'm-toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-label', 'Notifications');
    document.body.append(region);
  }
  const el = document.createElement('div');
  el.className = 'm-toast';
  el.setAttribute('role', options.tone === 'danger' ? 'alert' : 'status');
  if (options.tone) el.dataset.tone = options.tone;
  const content = document.createElement('div');
  content.className = 'm-toast-content';
  const title = document.createElement('p');
  title.className = 'm-toast-title';
  title.textContent = options.title;
  content.append(title);
  if (options.body) {
    const body = document.createElement('p');
    body.className = 'm-toast-body';
    body.textContent = options.body;
    content.append(body);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'm-toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.dataset.mToastClose = '';
  close.textContent = '✕';
  el.append(content, close);
  close.addEventListener('click', () => dismiss(el));
  region.append(el);

  const timeout = options.timeout ?? 5000;
  if (timeout > 0) {
    let remaining = timeout;
    let started = Date.now();
    let timer = setTimeout(() => dismiss(el), remaining);
    const pause = () => {
      clearTimeout(timer);
      remaining -= Date.now() - started;
    };
    const resume = () => {
      started = Date.now();
      timer = setTimeout(() => dismiss(el), Math.max(remaining, 1000));
    };
    el.addEventListener('pointerenter', pause);
    el.addEventListener('pointerleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);
  }
  return () => dismiss(el);
}

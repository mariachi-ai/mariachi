/**
 * Client-side filtering for index pages. Items carry `data-x-item` and `data-x-text` (lowercased
 * search text), optionally `data-x-status-value`; groups (`data-x-group`) hide when empty.
 */
export function bindFilter(name: string): void {
  const root = document.querySelector<HTMLElement>(`[data-x-filter="${name}"]`);
  if (!root) return;
  const input = root.querySelector<HTMLInputElement>('input[type="search"]');
  const statusButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-x-status]')];
  let status = 'all';
  const apply = () => {
    const query = (input?.value ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const item of document.querySelectorAll<HTMLElement>('[data-x-item]')) {
      const text = item.dataset.xText ?? '';
      const ok = query.every((q) => text.includes(q)) && (status === 'all' || item.dataset.xStatusValue === status);
      item.toggleAttribute('data-x-hidden', !ok);
      if (ok) shown++;
    }
    for (const group of document.querySelectorAll<HTMLElement>('[data-x-group]')) {
      group.toggleAttribute('data-x-hidden', !group.querySelector('[data-x-item]:not([data-x-hidden])'));
    }
    const empty = document.querySelector<HTMLElement>('[data-x-empty]');
    if (empty) empty.hidden = shown > 0;
  };
  input?.addEventListener('input', apply);
  for (const button of statusButtons) {
    button.addEventListener('click', () => {
      status = button.dataset.xStatus ?? 'all';
      for (const b of statusButtons) b.setAttribute('aria-pressed', String(b === button));
      apply();
    });
  }
  const initial = new URLSearchParams(location.search).get('q');
  if (initial && input) {
    input.value = initial;
    apply();
  }
}

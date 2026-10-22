import { defineExamples } from '../../contract/component';

const menu = `<div class="m-menu" role="menu" aria-label="Session actions">
    <div class="m-menu-label">Session</div>
    <button type="button" class="m-menu-item" role="menuitem">Rename <span class="m-menu-shortcut">R</span></button>
    <button type="button" class="m-menu-item" role="menuitem">Duplicate <span class="m-menu-shortcut">⌘D</span></button>
    <button type="button" class="m-menu-item" role="menuitem" aria-disabled="true">Share (pro only)</button>
    <div class="m-menu-separator" role="separator"></div>
    <button type="button" class="m-menu-item" role="menuitem" data-tone="danger">Delete <span class="m-menu-shortcut">⌫</span></button>
  </div>`;

export default defineExamples('popover', [
  {
    name: 'Menu',
    description: 'Shown inline with data-static.',
    html: `<div class="m-popover" data-static>
  ${menu}
</div>`,
  },
  {
    name: 'Anchored to its trigger',
    description: 'popovertarget opens it; it sits under the button where CSS anchor positioning is supported, and is centred otherwise.',
    html: `<button type="button" class="m-button" popovertarget="popover-actions">Actions ▾</button>
<div class="m-popover" id="popover-actions" popover data-placement="bottom-start">
  ${menu}
</div>`,
  },
  {
    name: 'Content popover',
    html: `<div class="m-popover" data-static style="padding: var(--m-space-4)">
  <div class="m-stack" data-gap="2">
    <strong>claude-opus-5-5</strong>
    <span class="m-muted">Input $5 / M tokens, output $25 / M tokens. 1M context.</span>
  </div>
</div>`,
  },
]);

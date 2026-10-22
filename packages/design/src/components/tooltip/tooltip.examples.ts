import { defineExamples } from '../../contract/component';

export default defineExamples('tooltip', [
  {
    name: 'Placements',
    description: 'Hover or focus the buttons. data-open forces them visible here.',
    html: `<div class="m-cluster" data-gap="8" style="padding: var(--m-space-10) var(--m-space-12)">
  <span class="m-tooltip" data-tip="Copy to clipboard" data-open>
    <button type="button" class="m-button" data-icon-only aria-label="Copy to clipboard">⧉</button>
  </span>
  <span class="m-tooltip" data-tip="Regenerate the last reply" data-placement="bottom" data-open>
    <button type="button" class="m-button" data-icon-only aria-label="Regenerate">↻</button>
  </span>
</div>`,
  },
  {
    name: 'On hover and focus',
    html: `<div class="m-cluster" style="padding-block-start: var(--m-space-8)">
  <span class="m-tooltip" data-tip="Requires the admin role">
    <button type="button" class="m-button" aria-disabled="true" aria-describedby="tip-admin">Rotate keys</button>
  </span>
  <span id="tip-admin" class="m-sr-only">Requires the admin role</span>
</div>`,
  },
]);

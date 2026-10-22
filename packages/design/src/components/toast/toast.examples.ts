import { defineExamples } from '../../contract/component';

const close = '<button type="button" class="m-toast-close" aria-label="Dismiss">✕</button>';

export default defineExamples('toast', [
  {
    name: 'Tones',
    description: 'The region is shown inline with data-static; in an app it is fixed to a corner.',
    html: `<div class="m-toast-region" data-static aria-live="polite">
  <div class="m-toast" role="status">
    <div class="m-toast-content"><p class="m-toast-title">Copied to clipboard</p></div>
    ${close}
  </div>
  <div class="m-toast" data-tone="success" role="status">
    <div class="m-toast-content">
      <p class="m-toast-title">Session exported</p>
      <p class="m-toast-body">transcript-2026-10-21.json is in your downloads.</p>
    </div>
    ${close}
  </div>
  <div class="m-toast" data-tone="danger" role="alert">
    <div class="m-toast-content">
      <p class="m-toast-title">Couldn't reach the model</p>
      <p class="m-toast-body">The request timed out after 30s. Your message was kept.</p>
    </div>
    ${close}
  </div>
</div>`,
  },
  {
    name: 'With an action',
    html: `<div class="m-toast-region" data-static aria-live="polite">
  <div class="m-toast" data-tone="accent" role="status">
    <div class="m-toast-content">
      <p class="m-toast-title">3 messages deleted</p>
      <div class="m-toast-actions">
        <button type="button" class="m-button" data-size="sm">Undo</button>
      </div>
    </div>
    ${close}
  </div>
</div>`,
  },
]);

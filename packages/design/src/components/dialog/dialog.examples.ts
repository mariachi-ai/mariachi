import { defineExamples } from '../../contract/component';

export default defineExamples('dialog', [
  {
    name: 'Confirmation',
    description: 'Shown inline with data-static. The real thing is a <dialog class="m-dialog"> opened with showModal().',
    html: `<div class="m-dialog" data-static data-size="sm" role="dialog" aria-modal="false" aria-labelledby="dlg-static-title" aria-describedby="dlg-static-desc">
  <header class="m-dialog-header">
    <div>
      <h2 class="m-dialog-title" id="dlg-static-title">Delete session?</h2>
      <p class="m-dialog-description" id="dlg-static-desc">The transcript and its 48 messages are removed. This can't be undone.</p>
    </div>
    <button type="button" class="m-button" data-variant="ghost" data-size="sm" data-icon-only aria-label="Close">✕</button>
  </header>
  <footer class="m-dialog-footer">
    <button type="button" class="m-button">Cancel</button>
    <button type="button" class="m-button" data-variant="danger">Delete</button>
  </footer>
</div>`,
  },
  {
    name: 'Modal',
    description: 'Opens with invoker commands (no JavaScript); the form method="dialog" buttons close it.',
    html: `<button type="button" class="m-button" data-variant="primary" commandfor="dlg-invite" command="show-modal">Invite teammate</button>
<dialog class="m-dialog" id="dlg-invite" aria-labelledby="dlg-invite-title">
  <header class="m-dialog-header">
    <h2 class="m-dialog-title" id="dlg-invite-title">Invite a teammate</h2>
    <form method="dialog"><button class="m-button" data-variant="ghost" data-size="sm" data-icon-only aria-label="Close">✕</button></form>
  </header>
  <div class="m-dialog-body">
    <p>They'll get an email with a link to join this workspace as a member.</p>
  </div>
  <footer class="m-dialog-footer">
    <form method="dialog">
      <button class="m-button" value="cancel" autofocus>Cancel</button>
      <button class="m-button" data-variant="primary" value="send">Send invite</button>
    </form>
  </footer>
</dialog>`,
  },
]);

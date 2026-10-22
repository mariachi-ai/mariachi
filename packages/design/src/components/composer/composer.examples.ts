import { defineExamples } from '../../contract/component';

/** The action row; `disabled` disables every control in it, as a disabled composer should. */
const actions = (send: string, disabled = false) => `<div class="m-composer-actions">
    <button type="button" class="m-button" data-variant="ghost" data-size="sm" data-icon-only aria-label="Attach file"${disabled ? ' disabled' : ''}>+</button>
    <select class="m-composer-model" aria-label="Model"${disabled ? ' disabled' : ''}>
      <option>claude-opus-5-5</option>
      <option>claude-sonnet-5-5</option>
      <option>claude-haiku-5-5</option>
    </select>
    <span class="m-composer-spacer"></span>
    ${send}
  </div>`;

export default defineExamples('composer', [
  {
    name: 'Default',
    html: `<form class="m-composer">
  <label class="m-sr-only" for="composer-1">Message</label>
  <textarea class="m-composer-input" id="composer-1" rows="1" placeholder="Ask about your data… (Shift+Enter for a new line)"></textarea>
  ${actions('<button type="submit" class="m-button" data-variant="primary" data-size="sm">Send</button>')}
</form>`,
  },
  {
    name: 'Streaming',
    html: `<form class="m-composer" data-state="streaming">
  <label class="m-sr-only" for="composer-2">Message</label>
  <textarea class="m-composer-input" id="composer-2" rows="1">Summarise the last three incidents and link the runbooks</textarea>
  ${actions('<button type="button" class="m-button" data-size="sm">Stop</button>')}
</form>`,
  },
  {
    name: 'Disabled',
    html: `<form class="m-composer">
  <label class="m-sr-only" for="composer-3">Message</label>
  <textarea class="m-composer-input" id="composer-3" rows="1" disabled placeholder="Token budget reached for this month"></textarea>
  ${actions('<button type="submit" class="m-button" data-variant="primary" data-size="sm" disabled>Send</button>', true)}
</form>`,
  },
]);

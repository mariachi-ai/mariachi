import { defineExamples } from '../../contract/component';

export default defineExamples('button', [
  {
    name: 'Variants',
    html: `<div class="m-cluster">
  <button type="button" class="m-button" data-variant="primary">Save changes</button>
  <button type="button" class="m-button">Cancel</button>
  <button type="button" class="m-button" data-variant="ghost">Skip</button>
  <button type="button" class="m-button" data-variant="danger">Delete</button>
</div>`,
  },
  {
    name: 'Sizes',
    html: `<div class="m-cluster">
  <button type="button" class="m-button" data-variant="primary" data-size="sm">Small</button>
  <button type="button" class="m-button" data-variant="primary">Medium</button>
  <button type="button" class="m-button" data-variant="primary" data-size="lg">Large</button>
</div>`,
  },
  {
    name: 'States',
    html: `<div class="m-cluster">
  <button type="button" class="m-button" data-variant="primary" aria-busy="true">Saving</button>
  <button type="button" class="m-button" disabled>Disabled</button>
  <button type="button" class="m-button" data-icon-only aria-label="Settings">⚙</button>
  <a class="m-button" href="#">Link as button</a>
</div>`,
  },
]);

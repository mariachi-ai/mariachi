import { defineExamples } from '../../contract/component';

export default defineExamples('input', [
  {
    name: 'Text and textarea',
    html: `<div class="m-stack" data-gap="3">
  <input class="m-input" type="text" placeholder="Project name" aria-label="Project name">
  <textarea class="m-input" placeholder="Describe the project" aria-label="Description"></textarea>
</div>`,
  },
  {
    name: 'Sizes',
    html: `<div class="m-stack" data-gap="2">
  <input class="m-input" data-size="sm" type="text" placeholder="Small" aria-label="Small">
  <input class="m-input" type="text" placeholder="Medium" aria-label="Medium">
  <input class="m-input" data-size="lg" type="text" placeholder="Large" aria-label="Large">
</div>`,
  },
  {
    name: 'States',
    html: `<div class="m-stack" data-gap="2">
  <input class="m-input" type="email" value="not-an-email" aria-invalid="true" aria-label="Email">
  <input class="m-input" type="text" value="Read only once published" disabled aria-label="Disabled">
</div>`,
  },
]);

import { defineExamples } from '../../contract/component';

const options = `<option>Postgres</option>
    <option>Redis</option>
    <option>NATS</option>`;

export default defineExamples('select', [
  {
    name: 'Default',
    html: `<select class="m-select" aria-label="Adapter">
    <option value="" disabled selected>Choose an adapter…</option>
    ${options}
  </select>`,
  },
  {
    name: 'Sizes',
    html: `<div class="m-stack" data-gap="2">
  <select class="m-select" data-size="sm" aria-label="Small">${options}</select>
  <select class="m-select" aria-label="Medium">${options}</select>
  <select class="m-select" data-size="lg" aria-label="Large">${options}</select>
</div>`,
  },
  {
    name: 'States',
    html: `<div class="m-stack" data-gap="2">
  <select class="m-select" aria-invalid="true" aria-label="Invalid">${options}</select>
  <select class="m-select" disabled aria-label="Disabled">${options}</select>
</div>`,
  },
]);

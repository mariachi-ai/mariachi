import { defineExamples } from '../../contract/component';

export default defineExamples('radio', [
  {
    name: 'Group',
    html: `<fieldset class="m-stack" data-gap="2">
  <legend>Plan</legend>
  <label class="m-field" data-layout="inline"><input class="m-radio" type="radio" name="plan-example" checked> Starter</label>
  <label class="m-field" data-layout="inline"><input class="m-radio" type="radio" name="plan-example"> Team</label>
  <label class="m-field" data-layout="inline"><input class="m-radio" type="radio" name="plan-example" disabled> Enterprise (contact sales)</label>
</fieldset>`,
  },
  {
    name: 'Invalid',
    html: `<fieldset class="m-cluster" data-gap="4">
  <legend class="m-sr-only">Region</legend>
  <label class="m-field" data-layout="inline"><input class="m-radio" type="radio" name="region-example" aria-invalid="true"> EU</label>
  <label class="m-field" data-layout="inline"><input class="m-radio" type="radio" name="region-example" aria-invalid="true"> US</label>
</fieldset>`,
  },
]);

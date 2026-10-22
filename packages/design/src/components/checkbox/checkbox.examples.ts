import { defineExamples } from '../../contract/component';

export default defineExamples('checkbox', [
  {
    name: 'States',
    html: `<div class="m-stack" data-gap="2">
  <label class="m-field" data-layout="inline"><input class="m-checkbox" type="checkbox"> Send weekly digest</label>
  <label class="m-field" data-layout="inline"><input class="m-checkbox" type="checkbox" checked> Email me on failures</label>
  <label class="m-field" data-layout="inline"><input class="m-checkbox" type="checkbox" aria-invalid="true"> Accept the terms</label>
  <label class="m-field" data-layout="inline"><input class="m-checkbox" type="checkbox" disabled checked> Required by your organisation</label>
</div>`,
  },
  {
    name: 'Group',
    description: 'Related boxes go in a fieldset with a legend.',
    html: `<fieldset class="m-stack" data-gap="2">
  <legend>Channels</legend>
  <label class="m-field" data-layout="inline"><input class="m-checkbox" type="checkbox" checked> Email</label>
  <label class="m-field" data-layout="inline"><input class="m-checkbox" type="checkbox"> SMS</label>
  <label class="m-field" data-layout="inline"><input class="m-checkbox" type="checkbox" checked> Push</label>
</fieldset>`,
  },
]);

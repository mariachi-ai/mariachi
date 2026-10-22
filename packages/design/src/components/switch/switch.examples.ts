import { defineExamples } from '../../contract/component';

export default defineExamples('switch', [
  {
    name: 'States',
    html: `<div class="m-stack" data-gap="3">
  <label class="m-field" data-layout="inline"><input class="m-switch" type="checkbox" role="switch" checked> Email alerts</label>
  <label class="m-field" data-layout="inline"><input class="m-switch" type="checkbox" role="switch"> Weekly digest</label>
  <label class="m-field" data-layout="inline"><input class="m-switch" type="checkbox" role="switch" disabled> Audit export (Enterprise)</label>
</div>`,
  },
  {
    name: 'Small',
    html: `<label class="m-field" data-layout="inline"><input class="m-switch" data-size="sm" type="checkbox" role="switch" checked> Compact mode</label>`,
  },
]);

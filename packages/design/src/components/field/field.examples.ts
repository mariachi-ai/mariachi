import { defineExamples } from '../../contract/component';

export default defineExamples('field', [
  {
    name: 'Label, hint and error',
    html: `<div class="m-stack" data-gap="4">
  <div class="m-field">
    <label class="m-field-label" for="ex-field-name">Project name</label>
    <input class="m-input" id="ex-field-name" type="text" required aria-describedby="ex-field-name-hint">
    <p class="m-field-hint" id="ex-field-name-hint">Lowercase letters and dashes. Shown in URLs.</p>
  </div>
  <div class="m-field">
    <label class="m-field-label" for="ex-field-email">Billing email</label>
    <input class="m-input" id="ex-field-email" type="email" value="finance@" aria-invalid="true" aria-describedby="ex-field-email-error">
    <p class="m-field-error" id="ex-field-email-error">Enter a full email address, like finance@acme.com.</p>
  </div>
  <div class="m-field">
    <label class="m-field-label" for="ex-field-region">Region</label>
    <select class="m-select" id="ex-field-region"><option>eu-west-1</option><option>us-east-1</option></select>
  </div>
</div>`,
  },
  {
    name: 'Inline rows',
    html: `<fieldset class="m-stack" data-gap="2">
  <legend class="m-field-label">Notifications</legend>
  <label class="m-field" data-layout="inline"><input class="m-checkbox" type="checkbox" checked> Deploy finished</label>
  <label class="m-field" data-layout="inline"><input class="m-radio" type="radio" name="ex-field-freq" checked> Instantly</label>
  <label class="m-field" data-layout="inline"><input class="m-radio" type="radio" name="ex-field-freq"> Daily summary</label>
</fieldset>`,
  },
]);

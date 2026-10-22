import { defineExamples } from '../../contract/component';

export default defineExamples('divider', [
  {
    name: 'Horizontal',
    html: `<div>
  <p>Account settings</p>
  <hr class="m-divider">
  <p>Danger zone</p>
</div>`,
  },
  {
    name: 'Labelled',
    html: `<div class="m-stack" data-gap="0">
  <button type="button" class="m-button" data-variant="primary">Continue with SSO</button>
  <div class="m-divider" role="separator" aria-label="or">or</div>
  <button type="button" class="m-button">Continue with email</button>
</div>`,
  },
  {
    name: 'Vertical',
    html: `<div class="m-cluster" data-gap="0">
  <a href="#">Docs</a>
  <hr class="m-divider" data-orientation="vertical">
  <a href="#">Changelog</a>
  <hr class="m-divider" data-orientation="vertical">
  <a href="#">Status</a>
</div>`,
  },
]);

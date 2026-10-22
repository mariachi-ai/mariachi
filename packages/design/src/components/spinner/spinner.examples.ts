import { defineExamples } from '../../contract/component';

export default defineExamples('spinner', [
  {
    name: 'Sizes',
    html: `<div class="m-cluster" data-gap="6">
  <span class="m-spinner" data-size="sm" role="status"><span class="m-sr-only">Loading</span></span>
  <span class="m-spinner" role="status"><span class="m-sr-only">Loading</span></span>
  <span class="m-spinner" data-size="lg" role="status"><span class="m-sr-only">Loading</span></span>
</div>`,
  },
  {
    name: 'With a label',
    html: `<div class="m-cluster" data-gap="2" aria-busy="true">
  <span class="m-spinner" data-size="sm" role="status"><span class="m-sr-only">Indexing</span></span>
  <span class="m-muted">Indexing 1,284 documents…</span>
</div>`,
  },
]);

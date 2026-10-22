import { defineExamples } from '../../contract/component';

export default defineExamples('kbd', [
  {
    name: 'Keys',
    html: `<p>Open search with <kbd class="m-kbd">Ctrl</kbd> + <kbd class="m-kbd">K</kbd>, then press <kbd class="m-kbd">Enter</kbd>.</p>`,
  },
  {
    name: 'Single keys',
    html: `<div class="m-cluster" data-gap="2">
  <kbd class="m-kbd">Esc</kbd>
  <kbd class="m-kbd" aria-label="Command">⌘</kbd>
  <kbd class="m-kbd" aria-label="Shift">⇧</kbd>
  <kbd class="m-kbd">/</kbd>
</div>`,
  },
]);

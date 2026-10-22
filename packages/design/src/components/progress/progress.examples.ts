import { defineExamples } from '../../contract/component';

export default defineExamples('progress', [
  {
    name: 'Progress',
    html: `<div class="m-stack" data-gap="3">
  <label class="m-stack" data-gap="1"><span class="m-muted">Embedding documents (640 of 1,000)</span><progress class="m-progress" value="64" max="100">64%</progress></label>
  <label class="m-stack" data-gap="1"><span class="m-muted">Fine-tune job: queued</span><progress class="m-progress" data-size="sm">Waiting</progress></label>
  <progress class="m-progress" data-size="lg" value="30" max="100" aria-label="Upload">30%</progress>
</div>`,
  },
  {
    name: 'Meter',
    html: `<div class="m-stack" data-gap="3">
  <label class="m-stack" data-gap="1"><span class="m-muted">Context window: 18% used</span><meter class="m-meter" min="0" max="100" low="70" high="90" optimum="0" value="18">18%</meter></label>
  <label class="m-stack" data-gap="1"><span class="m-muted">Context window: 78% used</span><meter class="m-meter" min="0" max="100" low="70" high="90" optimum="0" value="78">78%</meter></label>
  <label class="m-stack" data-gap="1"><span class="m-muted">Context window: 96% used</span><meter class="m-meter" min="0" max="100" low="70" high="90" optimum="0" value="96">96%</meter></label>
</div>`,
  },
]);

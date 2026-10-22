import { defineExamples } from '../../contract/component';

const tabs = (id: string, variant: string, labels: string[]) => `<div class="m-tabs"${variant ? ` data-variant="${variant}"` : ''}>
  <div class="m-tab-list" role="tablist" aria-label="Session views">
${labels
  .map(
    (l, i) =>
      `    <button type="button" class="m-tab" role="tab" id="${id}-tab-${i}" aria-controls="${id}-panel-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"${i === labels.length - 1 ? ' aria-disabled="true"' : ''}>${l}</button>`,
  )
  .join('\n')}
  </div>
${labels
  .map(
    (l, i) =>
      `  <div class="m-tab-panel" role="tabpanel" id="${id}-panel-${i}" aria-labelledby="${id}-tab-${i}" tabindex="0"${i === 0 ? '' : ' hidden'}>${l} panel: 48 messages, 12.4k tokens, $0.18.</div>`,
  )
  .join('\n')}
</div>`;

export default defineExamples('tabs', [
  { name: 'Underline', html: tabs('tabs-u', '', ['Transcript', 'Tool calls', 'Usage', 'Archived']) },
  { name: 'Pill', html: tabs('tabs-p', 'pill', ['Day', 'Week', 'Month', 'Year']) },
]);

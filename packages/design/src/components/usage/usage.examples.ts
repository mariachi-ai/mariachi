import { defineExamples } from '../../contract/component';

const meter = (level: string, value: number, label: string, amount: string, footer: [string, string]) => `<div class="m-usage" data-level="${level}" style="--m-usage-value: ${value}%">
  <div class="m-usage-header"><span class="m-usage-label">${label}</span><span class="m-usage-amount">${amount}</span></div>
  <div class="m-usage-bar" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"></div>
  <div class="m-usage-footer"><span>${footer[0]}</span><span>${footer[1]}</span></div>
</div>`;

export default defineExamples('usage', [
  {
    name: 'Levels',
    html: `<div class="m-stack" data-gap="5">
  ${meter('ok', 42, 'Tokens this month', '420k / 1M', ['$12.40 spent', 'Resets Nov 1'])}
  ${meter('warn', 86, 'Context window', '172k / 200k', ['Older turns will be summarised', 'claude-opus-5-5'])}
  ${meter('over', 100, 'Team credits', '$510 / $500', ['Requests paused', 'Raise the limit in Billing'])}
</div>`,
  },
]);

import { defineExamples } from '../../contract/component';

const items = (name?: string) => {
  const n = name ? ` name="${name}"` : '';
  return `<details class="m-accordion-item"${n} open>
    <summary>What counts toward the token budget?</summary>
    <div class="m-accordion-content">Input and output tokens of every model call in the tenant, including tool calls and retries.</div>
  </details>
  <details class="m-accordion-item"${n}>
    <summary>What happens when the budget runs out?</summary>
    <div class="m-accordion-content">New calls fail with ai/budget-exceeded until the period resets or the budget is raised.</div>
  </details>
  <details class="m-accordion-item"${n}>
    <summary>Can a session use more than one provider?</summary>
    <div class="m-accordion-content">Yes. The fallback adapter tries each provider in order when the primary fails.</div>
  </details>`;
};

export default defineExamples('accordion', [
  { name: 'Joined', description: 'Items sharing a name="…" open one at a time.', html: `<div class="m-accordion">\n  ${items('faq-joined')}\n</div>` },
  { name: 'Separated', html: `<div class="m-accordion" data-variant="separated">\n  ${items()}\n</div>` },
]);

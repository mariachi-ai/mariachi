import { defineExamples } from '../../contract/component';

export default defineExamples('citation', [
  {
    name: 'Inline chips',
    html: `<p>Budgets are enforced before the provider is called, so a rejected request is never billed<a class="m-citation" href="#source-1" aria-label="Source 1: AI guide">1</a>. Usage is tracked per tenant and resets each billing period<a class="m-citation" href="#source-2" aria-label="Source 2: Billing">2</a>.</p>`,
  },
  {
    name: 'Source list',
    html: `<ol class="m-citation-list" aria-label="Sources">
  <li class="m-citation-source" id="source-1">
    <a class="m-citation-title" href="#">AI: sessions, budgets and cost</a>
    <span class="m-citation-domain">docs/ai.md</span>
    <p class="m-citation-snippet">Token budgets are checked before each request. When a request would exceed the session or tenant budget it fails with ai/budget-exceeded and no provider call is made.</p>
  </li>
  <li class="m-citation-source" id="source-2">
    <a class="m-citation-title" href="#">Billing: usage and credits</a>
    <span class="m-citation-domain">docs/billing.md</span>
    <p class="m-citation-snippet">Usage records are written per tenant and aggregated per billing period; the credit ledger is locked while a period closes.</p>
  </li>
</ol>`,
  },
]);

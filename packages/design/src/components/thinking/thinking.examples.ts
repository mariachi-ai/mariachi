import { defineExamples } from '../../contract/component';

export default defineExamples('thinking', [
  {
    name: 'Finished, expanded',
    html: `<details class="m-thinking" open>
  <summary><span class="m-thinking-label">Thought for 12s</span><span class="m-thinking-duration">1,204 tokens</span></summary>
  <div class="m-thinking-body">
    <p>The user wants per-tenant limits, not a global cap. The budget option on createAI takes a perTenant value, and the session store already keys usage by tenant.</p>
    <p>I should mention that requests fail before reaching the provider, so nothing is billed.</p>
  </div>
</details>`,
  },
  {
    name: 'Running',
    html: `<details class="m-thinking" data-state="running" aria-busy="true">
  <summary><span class="m-thinking-label">Thinking…</span><span class="m-thinking-duration">4s</span></summary>
  <div class="m-thinking-body"><p>Comparing the two retry strategies…</p></div>
</details>`,
  },
]);

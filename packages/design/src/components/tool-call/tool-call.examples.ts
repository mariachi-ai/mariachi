import { defineExamples } from '../../contract/component';

export default defineExamples('tool-call', [
  {
    name: 'Statuses',
    html: `<div class="m-stack" data-gap="2">
  <details class="m-tool-call" data-status="pending"><summary><span class="m-tool-call-name">fetch_invoice</span><span class="m-tool-call-status">Queued</span></summary></details>
  <details class="m-tool-call" data-status="running"><summary><span class="m-tool-call-name">search_docs</span><span class="m-tool-call-status">Running</span><span class="m-tool-call-duration">2.1s</span></summary></details>
  <details class="m-tool-call" data-status="done"><summary><span class="m-tool-call-name">get_weather</span><span class="m-tool-call-status">Done</span><span class="m-tool-call-duration">0.4s</span></summary></details>
  <details class="m-tool-call" data-status="error" open>
    <summary><span class="m-tool-call-name">run_sql</span><span class="m-tool-call-status">Failed</span><span class="m-tool-call-duration">1.8s</span></summary>
    <div class="m-tool-call-body">
      <div><div class="m-tool-call-label">Error</div><pre class="m-code" tabindex="0"><code>relation "invoices_2025" does not exist</code></pre></div>
    </div>
  </details>
</div>`,
  },
  {
    name: 'Expanded with arguments and result',
    html: `<details class="m-tool-call" data-status="done" open>
  <summary><span class="m-tool-call-name">search_docs</span><span class="m-tool-call-status">Done</span><span class="m-tool-call-duration">1.2s</span></summary>
  <div class="m-tool-call-body">
    <div><div class="m-tool-call-label">Arguments</div><pre class="m-code" tabindex="0"><code>{ "query": "token budget per tenant", "limit": 5 }</code></pre></div>
    <div><div class="m-tool-call-label">Result</div><pre class="m-code" tabindex="0"><code>[{ "title": "AI: budgets", "url": "/docs/ai#budgets", "score": 0.92 }]</code></pre></div>
  </div>
</details>`,
  },
]);

import { defineExamples } from '../../contract/component';

export default defineExamples('prose', [
  {
    name: 'Rendered markdown',
    html: `<article class="m-prose">
  <h2>Streaming replies</h2>
  <p>Call <code>ai.stream(ctx, request)</code> to receive tokens as they arrive. Each chunk is validated against the <a href="#">stream contract</a>, and the session's <strong>token budget</strong> is checked before the request starts.</p>
  <ul>
    <li>Partial tool calls arrive as <code>tool-call-delta</code> chunks.</li>
    <li>Cancelling the request:
      <ol>
        <li>aborts the provider call,</li>
        <li>records the tokens already used.</li>
      </ol>
    </li>
  </ul>
  <blockquote><p>Budgets are enforced per tenant, so one noisy customer can't exhaust another's quota.</p></blockquote>
  <h3>Cost per model</h3>
  <table>
    <thead><tr><th>Model</th><th>Input / 1M</th><th>Output / 1M</th></tr></thead>
    <tbody>
      <tr><td>claude-opus-5-5</td><td>$15.00</td><td>$75.00</td></tr>
      <tr><td>claude-haiku-5-5</td><td>$0.80</td><td>$4.00</td></tr>
    </tbody>
  </table>
  <pre><code>const reply = await ai.stream(ctx, { model, messages });</code></pre>
  <hr>
  <p>See <a href="#">the AI guide</a> for fallbacks and cost tracking.</p>
</article>`,
  },
]);

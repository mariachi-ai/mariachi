import { defineExamples } from '../../contract/component';

const actions = `<div class="m-message-actions">
      <button type="button" class="m-button" data-variant="ghost" data-size="sm">Copy</button>
      <button type="button" class="m-button" data-variant="ghost" data-size="sm">Retry</button>
    </div>`;

const thread = (variant: string) => `<div class="m-chat"${variant ? ` data-variant="${variant}"` : ''} role="log" aria-live="polite" aria-label="Conversation">
  <article class="m-message" data-role="system">
    <div class="m-message-body">You're chatting with the Acme docs assistant. Answers cite the docs.</div>
  </article>
  <article class="m-message" data-role="user">
    <div class="m-message-avatar" aria-hidden="true">SK</div>
    <div class="m-message-body">How do I cap token spend per tenant?</div>
    <div class="m-message-meta"><span>You</span><span>10:42</span></div>
  </article>
  <article class="m-message" data-role="assistant">
    <div class="m-message-avatar" aria-hidden="true">AI</div>
    <div class="m-message-body">
      <div class="m-prose">
        <p>Set a <strong>token budget</strong> on the session. Requests that would exceed it fail before they reach the provider:</p>
        <pre><code>createAI({ budget: { perTenant: 2_000_000 } })</code></pre>
      </div>
    </div>
    <div class="m-message-meta"><span>Assistant</span><span>claude-opus-5-5</span><span>812 tokens</span></div>
    ${actions}
  </article>
  <article class="m-message" data-role="assistant" aria-busy="true">
    <div class="m-message-avatar" aria-hidden="true">AI</div>
    <div class="m-message-body" data-streaming>Budgets reset at the start of each billing period, and</div>
  </article>
</div>`;

export default defineExamples('chat', [
  { name: 'Bubbles', html: thread('') },
  { name: 'Flat', description: 'No bubbles; suits long-form answers.', html: thread('flat') },
]);

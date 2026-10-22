/**
 * Whole-page compositions built only from @mariachi/design components. They're how presets are
 * judged as a whole (sample pages, the compare view and the playground preview).
 */
export interface Sample {
  name: string;
  title: string;
  description: string;
  html: string;
}

const dashboard = `<div class="m-stack" data-gap="6">
  <div class="m-cluster" data-justify="between">
    <div class="m-stack" data-gap="1">
      <h2>Usage overview</h2>
      <span class="m-muted">Acme Inc · October 2026</span>
    </div>
    <div class="m-cluster" data-gap="2">
      <select class="m-select" data-size="sm" aria-label="Period"><option>Last 30 days</option><option>Last 7 days</option></select>
      <button type="button" class="m-button" data-size="sm">Export</button>
      <button type="button" class="m-button" data-variant="primary" data-size="sm">New API key</button>
    </div>
  </div>
  <div class="m-grid" style="--m-layout-grid-min: 12rem">
    <div class="m-card"><div class="m-card-body m-stack" data-gap="1" data-align="start"><span class="m-muted">Requests</span><strong style="font-size: var(--m-font-size-2xl)">1.28M</strong><span class="m-badge" data-tone="success">+12.4%</span></div></div>
    <div class="m-card"><div class="m-card-body m-stack" data-gap="1" data-align="start"><span class="m-muted">Tokens</span><strong style="font-size: var(--m-font-size-2xl)">412M</strong><span class="m-badge" data-tone="success">+8.1%</span></div></div>
    <div class="m-card"><div class="m-card-body m-stack" data-gap="1" data-align="start"><span class="m-muted">Spend</span><strong style="font-size: var(--m-font-size-2xl)">$3,904</strong><span class="m-badge" data-tone="warning">82% of budget</span></div></div>
    <div class="m-card"><div class="m-card-body m-stack" data-gap="1" data-align="start"><span class="m-muted">Error rate</span><strong style="font-size: var(--m-font-size-2xl)">0.12%</strong><span class="m-badge" data-tone="danger">+0.03%</span></div></div>
  </div>
  <div class="m-alert" data-tone="warning" role="status">
    <div class="m-alert-content">
      <div class="m-alert-title">Budget at 82%</div>
      <div class="m-alert-body">At the current rate the workspace hits its monthly token budget on Oct 27. Requests over budget fail with <code class="m-code-inline">ai/budget-exceeded</code>.</div>
    </div>
  </div>
  <div class="m-card">
    <div class="m-card-header"><div class="m-card-title">Budgets by tenant</div><div class="m-card-description">Resets on the 1st</div></div>
    <div class="m-card-body m-stack" data-gap="4">
      <div class="m-usage" data-level="ok" style="--m-usage-value: 42%"><div class="m-usage-header"><span class="m-usage-label">globex</span><span class="m-usage-amount">420k / 1M</span></div><div class="m-usage-bar" role="meter" aria-label="Tokens used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="42"></div></div>
      <div class="m-usage" data-level="warn" style="--m-usage-value: 86%"><div class="m-usage-header"><span class="m-usage-label">initech</span><span class="m-usage-amount">1.72M / 2M</span></div><div class="m-usage-bar" role="meter" aria-label="Tokens used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="86"></div></div>
      <div class="m-usage" data-level="over" style="--m-usage-value: 100%"><div class="m-usage-header"><span class="m-usage-label">umbrella</span><span class="m-usage-amount">500k / 500k</span></div><div class="m-usage-bar" role="meter" aria-label="Tokens used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"></div></div>
    </div>
  </div>
  <div class="m-card">
    <div class="m-card-header"><div class="m-card-title">Recent sessions</div></div>
    <div class="m-table-wrap" tabindex="0" role="region" aria-label="Recent sessions">
      <table class="m-table">
        <thead><tr><th>Session</th><th>Model</th><th>Tokens</th><th>Cost</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td class="m-cluster" data-gap="2"><span class="m-avatar" data-size="sm">JD</span> Refund policy Q&amp;A</td><td>claude-sonnet-5-5</td><td>18,204</td><td>$0.11</td><td><span class="m-badge" data-tone="success">Done</span></td></tr>
          <tr><td class="m-cluster" data-gap="2"><span class="m-avatar" data-size="sm">AK</span> Invoice extraction</td><td>claude-haiku-5-5</td><td>4,912</td><td>$0.01</td><td><span class="m-badge" data-tone="info">Running</span></td></tr>
          <tr><td class="m-cluster" data-gap="2"><span class="m-avatar" data-size="sm">MS</span> Contract review</td><td>claude-opus-5-5</td><td>92,330</td><td>$1.84</td><td><span class="m-badge" data-tone="danger">Failed</span></td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>`;

const settings = `<div class="m-stack" data-gap="6" style="max-inline-size: 44rem">
  <div class="m-stack" data-gap="1">
    <h2>Workspace settings</h2>
    <span class="m-muted">Changes apply to every member of Acme Inc.</span>
  </div>
  <div class="m-tabs">
    <div class="m-tab-list" role="tablist" aria-label="Settings">
      <button type="button" class="m-tab" role="tab" aria-selected="true">General</button>
      <button type="button" class="m-tab" role="tab" aria-selected="false">Models</button>
      <button type="button" class="m-tab" role="tab" aria-selected="false">Billing</button>
      <button type="button" class="m-tab" role="tab" aria-selected="false">Members</button>
    </div>
  </div>
  <form class="m-card" onsubmit="return false">
    <div class="m-card-header"><div class="m-card-title">General</div></div>
    <div class="m-card-body m-stack" data-gap="5">
      <div class="m-field">
        <label class="m-field-label" for="ws-name">Workspace name</label>
        <input class="m-input" id="ws-name" value="Acme Inc" />
      </div>
      <div class="m-field">
        <label class="m-field-label" for="ws-slug">URL</label>
        <input class="m-input" id="ws-slug" value="acme" aria-describedby="ws-slug-hint" />
        <p class="m-field-hint" id="ws-slug-hint">Lowercase letters and dashes. Used in API URLs.</p>
      </div>
      <div class="m-field">
        <label class="m-field-label" for="ws-model">Default model</label>
        <select class="m-select" id="ws-model"><option>claude-sonnet-5-5</option><option>claude-opus-5-5</option><option>claude-haiku-5-5</option></select>
      </div>
      <div class="m-field">
        <label class="m-field-label" for="ws-email">Billing email</label>
        <input class="m-input" id="ws-email" value="finance@" aria-invalid="true" aria-describedby="ws-email-error" />
        <p class="m-field-error" id="ws-email-error">Enter a full email address, like finance@acme.com.</p>
      </div>
      <fieldset class="m-stack" data-gap="2">
        <legend>Notifications</legend>
        <label class="m-field" data-layout="inline"><input type="checkbox" class="m-checkbox" checked /><span> Email me when a budget passes 80%</span></label>
        <label class="m-field" data-layout="inline"><input type="checkbox" class="m-checkbox" /><span> Weekly usage digest</span></label>
        <label class="m-field" data-layout="inline"><input type="checkbox" role="switch" class="m-switch" checked /><span> Fail closed when the budget is exhausted</span></label>
      </fieldset>
    </div>
    <div class="m-card-footer m-cluster" data-justify="end" data-gap="2">
      <button type="button" class="m-button">Cancel</button>
      <button type="submit" class="m-button" data-variant="primary">Save changes</button>
    </div>
  </form>
  <div class="m-card" data-variant="outline">
    <div class="m-card-header"><div class="m-card-title">Danger zone</div><div class="m-card-description">Deleting a workspace removes its sessions, keys and audit log after 30 days.</div></div>
    <div class="m-card-footer"><button type="button" class="m-button" data-variant="danger">Delete workspace</button></div>
  </div>
</div>`;

const chat = `<div class="m-stack" data-gap="4" style="max-inline-size: 48rem">
  <div class="m-cluster" data-justify="between">
    <div class="m-stack" data-gap="1"><h2>Docs assistant</h2><span class="m-muted">Answers cite the Mariachi docs</span></div>
    <span class="m-badge" data-tone="accent">claude-sonnet-5-5</span>
  </div>
  <div class="m-chat" role="log" aria-label="Conversation">
    <article class="m-message" data-role="user">
      <span class="m-message-avatar" aria-hidden="true">SK</span>
      <div class="m-message-body">How do I stop one tenant from burning the whole token budget?</div>
    </article>
    <article class="m-message" data-role="assistant">
      <span class="m-message-avatar" aria-hidden="true">AI</span>
      <div class="m-message-body">
        <details class="m-thinking"><summary><span class="m-thinking-label">Thought for 3s</span></summary><div class="m-thinking-body"><p>The user wants per-tenant limits. createAI accepts budgets per session and per tenant.</p></div></details>
        <details class="m-tool-call" data-status="done"><summary><span class="m-tool-call-name">search_docs</span><span class="m-tool-call-status">Done</span><span class="m-tool-call-duration">0.4s</span></summary><div class="m-tool-call-body"><div class="m-tool-call-label">Arguments</div><pre class="m-code"><code>{ "query": "token budget per tenant" }</code></pre></div></details>
        <div class="m-prose" data-size="sm">
          <p>Set a per-tenant budget when you create the AI service <a class="m-citation" href="#">1</a>. Requests that would exceed it fail <em>before</em> the provider is called, with <code>ai/budget-exceeded</code>:</p>
          <pre><code>createAI({ budget: { perTenant: 2_000_000 } })</code></pre>
        </div>
      </div>
    </article>
    <article class="m-message" data-role="assistant">
      <span class="m-message-avatar" aria-hidden="true">AI</span>
      <div class="m-message-body" data-streaming>Budgets reset at the start of each billing period, and usage is</div>
    </article>
  </div>
  <form class="m-composer" onsubmit="return false">
    <label class="m-sr-only" for="sample-composer">Message</label>
    <textarea class="m-composer-input" id="sample-composer" rows="1" placeholder="Ask about the docs…"></textarea>
    <div class="m-composer-actions">
      <button type="button" class="m-button" data-variant="ghost" data-size="sm" data-icon-only aria-label="Attach">+</button>
      <span class="m-composer-spacer"></span>
      <button type="submit" class="m-button" data-variant="primary" data-size="sm">Send</button>
    </div>
  </form>
</div>`;

const landing = `<div class="m-stack" data-gap="10">
  <div class="m-stack" data-gap="4" style="max-inline-size: 40rem">
    <span class="m-badge" data-tone="accent">New · Agents with budgets</span>
    <h2 style="font-size: var(--m-font-size-4xl)">Ship AI features without the plumbing.</h2>
    <p class="m-muted" style="font-size: var(--m-font-size-lg)">Sessions, budgets, retries, audit and billing as typed packages. Bring your models; Mariachi brings the backend.</p>
    <div class="m-cluster">
      <button type="button" class="m-button" data-variant="primary" data-size="lg">Start building</button>
      <button type="button" class="m-button" data-size="lg">Read the docs</button>
    </div>
  </div>
  <div class="m-grid" style="--m-layout-grid-min: 14rem">
    <div class="m-card"><div class="m-card-header"><div class="m-card-title">Typed procedures</div></div><div class="m-card-body m-muted">Controllers call services through one validated, traced boundary.</div></div>
    <div class="m-card"><div class="m-card-header"><div class="m-card-title">Budgets that hold</div></div><div class="m-card-body m-muted">Per-session and per-tenant token budgets enforced before the provider call.</div></div>
    <div class="m-card"><div class="m-card-header"><div class="m-card-title">Audit you can verify</div></div><div class="m-card-body m-muted">An append-only, hash-chained log per tenant, with export.</div></div>
  </div>
  <div class="m-card" data-variant="sunken">
    <div class="m-card-body m-cluster" data-justify="between">
      <div class="m-stack" data-gap="1"><strong>Get updates</strong><span class="m-muted">One email per release. No spam.</span></div>
      <form class="m-cluster" data-gap="2" onsubmit="return false"><label class="m-sr-only" for="sample-email">Email</label><input class="m-input" id="sample-email" type="email" placeholder="you@company.com" /><button type="submit" class="m-button" data-variant="primary">Subscribe</button></form>
    </div>
  </div>
</div>`;

const signIn = `<div style="display: grid; place-items: center; padding-block: var(--m-space-8)">
  <form class="m-card" style="inline-size: min(100%, 24rem)" onsubmit="return false">
    <div class="m-card-header m-stack" data-gap="1"><div class="m-card-title">Sign in to Acme</div><div class="m-card-description">Use your work email.</div></div>
    <div class="m-card-body m-stack" data-gap="4">
      <div class="m-field"><label class="m-field-label" for="si-email">Email</label><input class="m-input" id="si-email" type="email" autocomplete="email" placeholder="you@acme.com" /></div>
      <div class="m-field"><label class="m-field-label" for="si-password">Password</label><input class="m-input" id="si-password" type="password" autocomplete="current-password" /></div>
      <label class="m-field" data-layout="inline"><input type="checkbox" class="m-checkbox" /><span> Keep me signed in</span></label>
      <button type="submit" class="m-button" data-variant="primary">Sign in</button>
      <hr class="m-divider" />
      <button type="button" class="m-button">Continue with SSO</button>
    </div>
    <div class="m-card-footer"><span class="m-muted">No account? <a href="#">Ask your admin for an invite.</a></span></div>
  </form>
</div>`;

export const samples: Sample[] = [
  { name: 'dashboard', title: 'Dashboard', description: 'Stats, an alert, usage meters and a table.', html: dashboard },
  { name: 'settings', title: 'Settings form', description: 'Tabs, fields with hints and errors, checkboxes, a switch and a danger zone.', html: settings },
  { name: 'chat', title: 'AI chat', description: 'Messages, thinking, a tool call, citations, streaming and the composer.', html: chat },
  { name: 'landing', title: 'Landing page', description: 'Hero, feature cards and a signup form.', html: landing },
  { name: 'sign-in', title: 'Sign in', description: 'A focused auth form.', html: signIn },
];

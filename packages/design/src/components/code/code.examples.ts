import { defineExamples } from '../../contract/component';

const k = (s: string) => `<span style="color: var(--shiki-token-keyword)">${s}</span>`;
const str = (s: string) => `<span style="color: var(--shiki-token-string)">${s}</span>`;
const fn = (s: string) => `<span style="color: var(--shiki-token-function)">${s}</span>`;
const c = (s: string) => `<span style="color: var(--shiki-token-constant)">${s}</span>`;
const com = (s: string) => `<span style="color: var(--shiki-token-comment)">${s}</span>`;
const p = (s: string) => `<span style="color: var(--shiki-token-punctuation)">${s}</span>`;

export default defineExamples('code', [
  {
    name: 'Highlighted block with header',
    description: 'Shiki output with the css-variables theme looks like this; colours come from the preset.',
    html: `<div class="m-code-frame">
  <div class="m-code-header">
    <span class="m-code-lang">agent.ts</span>
    <button type="button" class="m-button" data-variant="ghost" data-size="sm">Copy</button>
  </div>
  <pre class="m-code" tabindex="0"><code>${com('// Stream a reply with a token budget')}
${k('const')} reply ${p('=')} ${k('await')} ai${p('.')}${fn('stream')}${p('(')}ctx${p(',')} ${p('{')}
  model${p(':')} ${str("'claude-opus-5-5'")}${p(',')}
  maxTokens${p(':')} ${c('4096')}${p(',')}
  tools${p(':')} ${p('[')}searchDocs${p(']')}${p(',')}
${p('});')}</code></pre>
</div>`,
  },
  {
    name: 'Plain block',
    html: `<pre class="m-code" tabindex="0"><code>pnpm add @mariachi/design
mariachi design build --config mariachi.design.ts</code></pre>`,
  },
  {
    name: 'Inline',
    html: `<p>Set <code class="m-code-inline">data-theme="minimal"</code> on the root, then call <code class="m-code-inline">buildDesign()</code> to emit overrides.</p>`,
  },
]);

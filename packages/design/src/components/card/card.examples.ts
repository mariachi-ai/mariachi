import { defineExamples } from '../../contract/component';

export default defineExamples('card', [
  {
    name: 'Header, body and footer',
    html: `<article class="m-card">
  <header class="m-card-header">
    <div>
      <h3 class="m-card-title">Usage this month</h3>
      <p class="m-card-description">Tokens across all sessions, reset on the 1st.</p>
    </div>
    <button type="button" class="m-button" data-variant="ghost" data-size="sm">Details</button>
  </header>
  <div class="m-card-body">1.24M of 2M tokens used across 312 sessions.</div>
  <footer class="m-card-footer">
    <button type="button" class="m-button" data-size="sm">Export</button>
    <button type="button" class="m-button" data-variant="primary" data-size="sm">Upgrade</button>
  </footer>
</article>`,
  },
  {
    name: 'Variants',
    html: `<div class="m-grid" style="--m-layout-grid-min: 9rem">
  <div class="m-card" data-size="sm"><h3 class="m-card-title">Elevated</h3><p class="m-card-description">Default</p></div>
  <div class="m-card" data-size="sm" data-variant="outline"><h3 class="m-card-title">Outline</h3><p class="m-card-description">No shadow</p></div>
  <div class="m-card" data-size="sm" data-variant="sunken"><h3 class="m-card-title">Sunken</h3><p class="m-card-description">Recessed</p></div>
</div>`,
  },
  {
    name: 'Interactive',
    description: 'An <a class="m-card"> lifts on hover and gets the focus ring.',
    html: `<a class="m-card" href="#">
  <h3 class="m-card-title">@mariachi/ai</h3>
  <p class="m-card-description">LLM sessions, token budgets, streaming and provider fallback.</p>
</a>`,
  },
]);

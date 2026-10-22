import { defineExamples } from '../../contract/component';

export default defineExamples('navbar', [
  {
    name: 'Brand, links and actions',
    html: `<header class="m-navbar">
  <a class="m-navbar-brand" href="#">◆ Mariachi</a>
  <nav class="m-navbar-nav" aria-label="Main">
    <a class="m-navbar-link" href="#" aria-current="page">Packages</a>
    <a class="m-navbar-link" href="#">Guides</a>
    <a class="m-navbar-link" href="#">Design</a>
  </nav>
  <div class="m-navbar-actions">
    <button type="button" class="m-button" data-variant="ghost" data-size="sm" data-icon-only aria-label="Search">⌕</button>
    <a class="m-button" data-variant="primary" data-size="sm" href="#">Get started</a>
  </div>
</header>`,
  },
  {
    name: 'Sticky and translucent',
    description: 'Scroll the box: the bar stays on top and blurs the content behind it.',
    html: `<div style="block-size: 10rem; overflow: auto; border: var(--m-border-width-thin) solid var(--m-color-border-default)">
  <header class="m-navbar" data-sticky data-translucent>
    <a class="m-navbar-brand" href="#">Acme</a>
    <nav class="m-navbar-nav" aria-label="Main">
      <a class="m-navbar-link" href="#">Docs</a>
      <a class="m-navbar-link" href="#" aria-current="page">Pricing</a>
    </nav>
  </header>
  <div class="m-stack" style="padding: var(--m-space-4)">
    <p>Content scrolls under the bar.</p><p>More content.</p><p>And more.</p><p>Still more.</p><p>The end.</p>
  </div>
</div>`,
  },
]);

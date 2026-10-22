import { defineExamples } from '../../contract/component';

export default defineExamples('breadcrumb', [
  {
    name: 'Path',
    html: `<nav class="m-breadcrumb" aria-label="Breadcrumb">
  <ol>
    <li><a href="#">Packages</a></li>
    <li><a href="#">@mariachi/ai</a></li>
    <li><a href="#">API</a></li>
    <li><span aria-current="page">createAI</span></li>
  </ol>
</nav>`,
  },
  {
    name: 'Custom separator',
    description: 'Change the glyph with one token.',
    html: `<nav class="m-breadcrumb" aria-label="Breadcrumb" style="--m-breadcrumb-separator: '›'">
  <ol>
    <li><a href="#">Settings</a></li>
    <li><a href="#">Billing</a></li>
    <li><span aria-current="page">Invoices</span></li>
  </ol>
</nav>`,
  },
]);

import { defineExamples } from '../../contract/component';

const box = (label: string) =>
  `<div style="padding: var(--m-space-3); border: var(--m-border-width-thin) dashed var(--m-color-border-strong); border-radius: var(--m-radius-sm)">${label}</div>`;

export default defineExamples('layout', [
  {
    name: 'Stack',
    html: `<div class="m-stack" data-gap="2">
  ${box('One')}
  ${box('Two')}
  ${box('Three')}
</div>`,
  },
  {
    name: 'Cluster',
    description: 'Wraps on narrow screens. data-justify="between" pushes items apart.',
    html: `<div class="m-cluster" data-justify="between">
  ${box('Left')}
  <div class="m-cluster" data-gap="2">${box('Right A')}${box('Right B')}</div>
</div>`,
  },
  {
    name: 'Grid',
    html: `<div class="m-grid" style="--m-layout-grid-min: 8rem">
  ${box('A')}${box('B')}${box('C')}${box('D')}
</div>`,
  },
  {
    name: 'Split',
    html: `<div class="m-split" style="--m-layout-split-side: 8rem">
  ${box('Side')}
  ${box('Main content')}
</div>`,
  },
]);

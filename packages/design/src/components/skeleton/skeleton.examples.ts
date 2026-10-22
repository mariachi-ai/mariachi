import { defineExamples } from '../../contract/component';

export default defineExamples('skeleton', [
  {
    name: 'Message loading',
    html: `<div class="m-cluster" data-align="start" data-gap="3" aria-busy="true">
  <div class="m-skeleton" data-shape="circle" aria-hidden="true"></div>
  <div class="m-stack" data-gap="2" style="flex: 1" aria-hidden="true">
    <div class="m-skeleton" style="inline-size: 30%"></div>
    <div class="m-skeleton"></div>
    <div class="m-skeleton" style="inline-size: 85%"></div>
    <div class="m-skeleton" style="inline-size: 60%"></div>
  </div>
</div>`,
  },
  {
    name: 'Card grid',
    html: `<div class="m-grid" style="--m-layout-grid-min: 9rem" aria-busy="true">
  <div class="m-stack" data-gap="2" aria-hidden="true"><div class="m-skeleton" data-shape="block" style="block-size: 5rem"></div><div class="m-skeleton" style="inline-size: 70%"></div></div>
  <div class="m-stack" data-gap="2" aria-hidden="true"><div class="m-skeleton" data-shape="block" style="block-size: 5rem"></div><div class="m-skeleton" style="inline-size: 50%"></div></div>
  <div class="m-stack" data-gap="2" aria-hidden="true"><div class="m-skeleton" data-shape="block" style="block-size: 5rem"></div><div class="m-skeleton" style="inline-size: 80%"></div></div>
</div>`,
  },
]);

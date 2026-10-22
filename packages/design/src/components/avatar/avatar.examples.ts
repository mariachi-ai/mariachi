import { defineExamples } from '../../contract/component';

const photo = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23c7d2fe'/><circle cx='20' cy='15' r='7' fill='%234f46e5'/><path d='M6 38c2-9 8-13 14-13s12 4 14 13z' fill='%234f46e5'/></svg>";

export default defineExamples('avatar', [
  {
    name: 'Sizes',
    html: `<div class="m-cluster">
  <span class="m-avatar" data-size="sm" aria-label="Ada Lovelace">AL</span>
  <span class="m-avatar" aria-label="Grace Hopper">GH</span>
  <span class="m-avatar" data-size="lg" aria-label="Alan Turing">AT</span>
  <img class="m-avatar" data-size="lg" src="${photo}" alt="Margaret Hamilton">
</div>`,
  },
  {
    name: 'Group',
    html: `<div class="m-avatar-group">
  <span class="m-avatar" aria-label="Ada Lovelace">AL</span>
  <span class="m-avatar" aria-label="Grace Hopper">GH</span>
  <img class="m-avatar" src="${photo}" alt="Margaret Hamilton">
  <span class="m-avatar" aria-label="3 more members">+3</span>
</div>`,
  },
  {
    name: 'With a name',
    html: `<div class="m-cluster" data-gap="2">
  <span class="m-avatar" data-size="sm" aria-hidden="true">KJ</span>
  <span>Katherine Johnson</span>
</div>`,
  },
]);

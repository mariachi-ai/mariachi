import { defineExamples } from '../../contract/component';

export default defineExamples('pagination', [
  {
    name: 'Pages with ellipsis',
    html: `<nav class="m-pagination" aria-label="Pagination">
  <ul>
    <li><a class="m-pagination-item" aria-disabled="true" aria-label="Previous page">‹ Prev</a></li>
    <li><a class="m-pagination-item" href="#" aria-current="page">1</a></li>
    <li><a class="m-pagination-item" href="#">2</a></li>
    <li><a class="m-pagination-item" href="#">3</a></li>
    <li><span class="m-pagination-ellipsis" aria-hidden="true">…</span></li>
    <li><a class="m-pagination-item" href="#">24</a></li>
    <li><a class="m-pagination-item" href="#" aria-label="Next page">Next ›</a></li>
  </ul>
</nav>`,
  },
]);

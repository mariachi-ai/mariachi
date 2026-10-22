import { defineExamples } from '../../contract/component';

export default defineExamples('sidebar', [
  {
    name: 'Sections, groups and counts',
    html: `<nav class="m-sidebar" aria-label="Documentation">
  <div class="m-sidebar-section">
    <h2 class="m-sidebar-heading">Foundation</h2>
    <ul>
      <li><a class="m-sidebar-link" href="#">@mariachi/config</a></li>
      <li><a class="m-sidebar-link" href="#" aria-current="page">@mariachi/core</a></li>
      <li><a class="m-sidebar-link" href="#">@mariachi/lifecycle</a></li>
    </ul>
  </div>
  <details class="m-sidebar-section m-sidebar-group" open>
    <summary class="m-sidebar-heading">Domain features</summary>
    <ul>
      <li>
        <a class="m-sidebar-link" href="#">@mariachi/ai <span class="m-sidebar-count">42</span></a>
        <ul>
          <li><a class="m-sidebar-link" href="#">Sessions</a></li>
          <li><a class="m-sidebar-link" href="#">Fallback</a></li>
        </ul>
      </li>
      <li><a class="m-sidebar-link" href="#">@mariachi/billing <span class="m-sidebar-count">17</span></a></li>
    </ul>
  </details>
  <details class="m-sidebar-section m-sidebar-group">
    <summary class="m-sidebar-heading">Tooling</summary>
    <ul>
      <li><a class="m-sidebar-link" href="#">@mariachi/cli</a></li>
    </ul>
  </details>
</nav>`,
  },
]);

import { defineExamples } from '../../contract/component';

const rows = [
  ['nightly-report', 'Succeeded', 'success', '1m 12s', '2,408'],
  ['sync-stripe', 'Running', 'info', '0m 41s', '312'],
  ['reindex-search', 'Failed', 'danger', '3m 05s', '18,220'],
  ['prune-sessions', 'Queued', 'neutral', '—', '0'],
];
const body = rows
  .map(
    ([name, status, tone, time, n]) =>
      `<tr><th scope="row">${name}</th><td><span class="m-badge" data-tone="${tone}">${status}</span></td><td data-numeric>${time}</td><td data-numeric>${n}</td></tr>`,
  )
  .join('\n      ');
const table = (attrs = '') => `<div class="m-table-wrap" tabindex="0" role="region" aria-label="Recent jobs">
  <table class="m-table"${attrs}>
    <caption class="m-sr-only">Recent jobs</caption>
    <thead><tr><th scope="col">Job</th><th scope="col">Status</th><th scope="col" data-numeric>Duration</th><th scope="col" data-numeric>Records</th></tr></thead>
    <tbody>
      ${body}
    </tbody>
  </table>
</div>`;

export default defineExamples('table', [
  { name: 'Default', html: table() },
  { name: 'Striped and compact', html: table(' data-striped data-density="compact"') },
]);

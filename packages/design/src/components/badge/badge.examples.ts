import { defineExamples } from '../../contract/component';

const tones = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'];
const row = (variant: string) =>
  `<div class="m-cluster" data-gap="2">
  ${tones.map((t) => `<span class="m-badge" data-tone="${t}"${variant === 'subtle' ? '' : ` data-variant="${variant}"`}>${t[0].toUpperCase()}${t.slice(1)}</span>`).join('\n  ')}
</div>`;

export default defineExamples('badge', [
  { name: 'Subtle', html: row('subtle') },
  { name: 'Solid', html: row('solid') },
  { name: 'Outline', html: row('outline') },
  {
    name: 'In context',
    html: `<div class="m-cluster" data-gap="2">
  <strong>@mariachi/design</strong>
  <span class="m-badge" data-tone="warning">alpha</span>
  <span class="m-badge" data-tone="danger" data-variant="solid">3<span class="m-sr-only"> failed jobs</span></span>
</div>`,
  },
]);

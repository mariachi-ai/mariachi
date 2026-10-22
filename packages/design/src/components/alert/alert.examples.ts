import { defineExamples } from '../../contract/component';

const alert = (tone: string, role: string, icon: string, title: string, body: string) => `<div class="m-alert" data-tone="${tone}" role="${role}">
  <span class="m-alert-icon" aria-hidden="true">${icon}</span>
  <div class="m-alert-content">
    <p class="m-alert-title">${title}</p>
    <p class="m-alert-body">${body}</p>
  </div>
</div>`;

export default defineExamples('alert', [
  {
    name: 'Tones',
    html: `<div class="m-stack" data-gap="3">
  ${alert('neutral', 'status', 'ℹ', 'Heads up', 'Scheduled maintenance on Sunday at 02:00 UTC.')}
  ${alert('accent', 'status', '✦', 'New model available', 'Sessions can now use the latest Claude models.')}
  ${alert('success', 'status', '✓', 'Deployment finished', 'Version 0.1.4 is live in all regions.')}
  ${alert('warning', 'status', '!', 'Budget at 85%', 'This tenant will hit its token budget in about 3 days.')}
  ${alert('danger', 'alert', '✕', 'Webhook signature failed', 'Check that STRIPE_WEBHOOK_SECRET matches the dashboard.')}
  ${alert('info', 'status', 'i', 'Read-only replica', 'Writes are queued until the primary is back.')}
</div>`,
  },
  {
    name: 'With actions, no icon',
    html: `<div class="m-alert" data-tone="warning" role="status">
  <div class="m-alert-content">
    <p class="m-alert-title">Your trial ends in 3 days</p>
    <p class="m-alert-body">Add a payment method to keep your workspace and its data.</p>
    <div class="m-alert-actions">
      <button type="button" class="m-button" data-variant="primary" data-size="sm">Add payment method</button>
      <button type="button" class="m-button" data-variant="ghost" data-size="sm">Remind me later</button>
    </div>
  </div>
</div>`,
  },
]);

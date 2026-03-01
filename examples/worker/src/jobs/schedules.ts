import type { ScheduleDefinition } from '@mariachi/jobs';

export const schedules: ScheduleDefinition[] = [
  {
    name: 'daily-billing-sync',
    cron: '0 2 * * *', // 2 AM daily
    jobName: 'billing.sync',
    data: { tenantId: 'all', customerId: 'all' },
  },
  {
    name: 'hourly-metrics-flush',
    cron: '0 * * * *',
    jobName: 'metrics.flush',
  },
  {
    name: 'weekly-inactive-cleanup',
    cron: '0 3 * * 0', // Sunday 3 AM
    jobName: 'users.cleanup-inactive',
  },
];

import { describe, expect, it } from 'vitest';
import { createContext } from '@mariachi/core';
import { DefaultNotifications } from './notifications';
import { MemoryDeliveryStore, MemoryInAppStore, MemoryPreferenceStore } from './store/memory';
import type { EmailAdapter, EmailMessage, NotificationQueue } from './types';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };

class CaptureEmail implements EmailAdapter {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
    return { id: 'em_1' };
  }
}

describe('notify', () => {
  it('sends email and writes an in-app notification', async () => {
    const email = new CaptureEmail();
    const inApp = new MemoryInAppStore();
    const deliveries = new MemoryDeliveryStore();
    const notifications = new DefaultNotifications({ email, inApp, deliveries }, { logger: silent });
    const ctx = createContext({ logger: silent, tenantId: 't1', userId: 'u1' });
    await notifications.notify(ctx, {
      recipientUserId: 'u1',
      recipientTenantId: 't1',
      category: 'billing',
      email: 'a@b.c',
      template: { id: 't', name: 't', subject: 'Hello {{name}}', body: 'Hi {{name}}', channel: 'email' },
      variables: { name: 'Ada' },
    });
    expect(email.sent[0]?.subject).toBe('Hello Ada');
    expect(inApp.items).toHaveLength(1);
    expect(deliveries.records.map((r) => r.status)).toEqual(['sent', 'sent']);
  });

  it('skips channels the user opted out of', async () => {
    const email = new CaptureEmail();
    const preferences = new MemoryPreferenceStore();
    await preferences.setChannels('u1', 't1', 'billing', ['in_app']);
    const inApp = new MemoryInAppStore();
    const notifications = new DefaultNotifications({ email, inApp, preferences }, { logger: silent });
    await notifications.notify(createContext({ logger: silent, tenantId: 't1' }), {
      recipientUserId: 'u1',
      recipientTenantId: 't1',
      category: 'billing',
      email: 'a@b.c',
      template: { id: 't', name: 't', subject: 'S', body: 'B', channel: 'email' },
      variables: {},
    });
    expect(email.sent).toHaveLength(0);
    expect(inApp.items).toHaveLength(1);
  });

  it('enqueues one job per channel', async () => {
    const queued: string[] = [];
    const queue: NotificationQueue = { async enqueue(_ctx, _name, data) { queued.push(data.channel); return 'job'; } };
    const notifications = new DefaultNotifications({ email: new CaptureEmail(), queue }, { logger: silent });
    await notifications.notify(createContext({ logger: silent }), {
      recipientUserId: 'u1',
      recipientTenantId: 't1',
      category: 'billing',
      channels: ['email', 'in_app'],
      email: 'a@b.c',
      template: { id: 't', name: 't', subject: 'S', body: 'B', channel: 'email' },
      variables: {},
    });
    expect(queued).toEqual(['email', 'in_app']);
  });

  it('keeps one delivery row per channel and counts retries', async () => {
    let calls = 0;
    const email: EmailAdapter = { async send() { calls += 1; if (calls < 3) throw new Error('smtp down'); return { id: 'em_ok' }; } };
    const deliveries = new MemoryDeliveryStore();
    const notifications = new DefaultNotifications({ email, deliveries, attempts: 3 }, { logger: silent });
    const id = await notifications.notify(createContext({ logger: silent }), {
      recipientUserId: 'u1', recipientTenantId: 't1', category: 'billing', channels: ['email'], email: 'a@b.c',
      template: { id: 't', name: 't', subject: 'S', body: 'B', channel: 'email' }, variables: {},
    });
    expect(await deliveries.list(id)).toMatchObject([{ channel: 'email', status: 'sent', attemptCount: 3, externalId: 'em_ok' }]);
    expect(await deliveries.updateByExternalId('em_ok', { status: 'delivered', deliveredAt: new Date() })).toBe(true);
    expect((await deliveries.get(id, 'email'))?.status).toBe('delivered');
  });

  it('worker makes one attempt per job and skips channels already sent', async () => {
    const email = new CaptureEmail();
    const deliveries = new MemoryDeliveryStore();
    const jobs: Array<Parameters<NotificationQueue['enqueue']>[2]> = [];
    const queue: NotificationQueue = { async enqueue(_ctx, _name, data) { jobs.push(data); return 'job'; } };
    const notifications = new DefaultNotifications({ email, deliveries, queue }, { logger: silent });
    const ctx = createContext({ logger: silent });
    await notifications.notify(ctx, {
      recipientUserId: 'u1', recipientTenantId: 't1', category: 'billing', channels: ['email'], email: 'a@b.c',
      template: { id: 't', name: 't', subject: 'S', body: 'B', channel: 'email' }, variables: {},
    });
    expect(deliveries.records[0]).toMatchObject({ status: 'queued', attemptCount: 0 });

    const failing = new DefaultNotifications({ email: { async send() { throw new Error('down'); } }, deliveries }, { logger: silent });
    await expect(failing.deliverJob(ctx, jobs[0]!)).rejects.toThrow();
    expect(deliveries.records[0]).toMatchObject({ status: 'failed', attemptCount: 1 });

    await notifications.deliverJob(ctx, jobs[0]!);
    await notifications.deliverJob(ctx, jobs[0]!); // a duplicate delivery of the job
    expect(email.sent).toHaveLength(1);
    expect(deliveries.records).toHaveLength(1);
    expect(deliveries.records[0]).toMatchObject({ status: 'sent', attemptCount: 2 });
  });

  it('does not retry a missing recipient', async () => {
    let calls = 0;
    const email: EmailAdapter = { async send() { calls += 1; return { id: 'x' }; } };
    const notifications = new DefaultNotifications({ email, attempts: 5 }, { logger: silent });
    await expect(notifications.notify(createContext({ logger: silent }), {
      recipientUserId: 'u1', recipientTenantId: 't1', category: 'billing', channels: ['email'],
      template: { id: 't', name: 't', subject: 'S', body: 'B', channel: 'email' }, variables: {},
    })).rejects.toMatchObject({ code: 'notifications/missing-recipient' });
    expect(calls).toBe(0);
  });

  it('only the recipient can mark a notification read', async () => {
    const inbox = new MemoryInAppStore();
    const n = await inbox.create({ userId: 'u1', tenantId: 't1', title: 'T', body: 'B', type: 'x' });
    await inbox.markRead(n.id, 'u2');
    expect(await inbox.findUnread('u1')).toHaveLength(1);
    await inbox.markRead(n.id, 'u1');
    expect(await inbox.findUnread('u1')).toHaveLength(0);
  });

  it('escapes variables in email HTML but not in SMS, and keeps subjects on one line', async () => {
    const { renderTemplate } = await import('./template');
    const template = { id: 't', name: 't', subject: 'Hi {{name}}', body: '<p>{{name}}</p>{{{footer}}}', channel: 'email' as const };
    const vars = { name: '<b>Eve</b>\r\nBcc: x@y.z', footer: '<hr>' };
    expect(renderTemplate(template, vars, { html: true })).toEqual({
      subject: 'Hi <b>Eve</b> Bcc: x@y.z',
      body: '<p>&lt;b&gt;Eve&lt;/b&gt;\r\nBcc: x@y.z</p><hr>',
    });
    expect(renderTemplate(template, { name: 'A & B' }).body).toBe('<p>A & B</p>{{{footer}}}');
  });
});

describe('notificationJobSchema', () => {
  it('accepts the jobs notify enqueues and rejects malformed ones', async () => {
    const { notificationJobSchema } = await import('./job-schema');
    const jobs: unknown[] = [];
    const notifications = new DefaultNotifications(
      { email: new CaptureEmail(), queue: { async enqueue(_c, _n, data) { jobs.push(data); return 'j'; } } },
      { logger: silent },
    );
    await notifications.notify(createContext({ logger: silent, tenantId: 't1' }), {
      recipientUserId: 'u1', recipientTenantId: 't1', category: 'c', channels: ['email', 'in_app'], email: 'a@b.c',
      template: { id: 't', name: 't', subject: 'S', body: 'B', channel: 'email' }, variables: {},
    });
    for (const job of jobs) expect(notificationJobSchema.safeParse(job).success).toBe(true);
    expect(notificationJobSchema.safeParse({ ...(jobs[0] as object), channel: 'fax' }).success).toBe(false);
  });
});

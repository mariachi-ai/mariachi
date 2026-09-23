import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContext } from '@mariachi/core';
import { applySchema, createPostgresDatabase, type PostgresDatabase } from '@mariachi/database-postgres';
import { startPostgres, stopAll } from '../../../../test/setup';
import { DefaultNotifications } from '../notifications';
import { notificationDeliveriesTable, notificationPreferencesTable, notificationsTable } from '../schema/index';
import type { EmailAdapter } from '../types';
import { DrizzleNotificationStore } from './index';

const silent = { info() {}, warn() {}, error() {}, debug() {}, child() { return silent; } };
const run = crypto.randomUUID().slice(0, 8);
const tenant = `t-${run}`;
let database: PostgresDatabase;
let store: DrizzleNotificationStore;

beforeAll(async () => {
  database = createPostgresDatabase({ url: await startPostgres() });
  await database.connect();
  await applySchema(database.db, [notificationsTable, notificationPreferencesTable, notificationDeliveriesTable]);
  store = new DrizzleNotificationStore(database.db);
}, 180_000);

afterAll(async () => {
  await database?.disconnect();
  await stopAll();
});

describe('DrizzleNotificationStore', () => {
  it('stores preferences, including a full opt-out, under concurrent writes', async () => {
    expect(await store.getChannels('u1', tenant, 'billing')).toEqual(['email', 'in_app']);
    await Promise.all([
      store.setChannels('u1', tenant, 'billing', ['sms']),
      store.setChannels('u1', tenant, 'billing', ['push']),
    ]);
    expect((await store.getChannels('u1', tenant, 'billing')).length).toBe(1);
    await store.setChannels('u1', tenant, 'billing', []);
    expect(await store.getChannels('u1', tenant, 'billing')).toEqual([]);
  });

  it('keeps an inbox that only the recipient can mark read', async () => {
    const n = await store.create({ userId: 'u2', tenantId: tenant, title: 'T', body: 'B', type: 'x', metadata: { a: 1 } });
    await store.create({ userId: 'u2', tenantId: `${tenant}-other`, title: 'T', body: 'B', type: 'x' });
    expect(await store.findUnread('u2', tenant)).toHaveLength(1);
    await store.markRead(n.id, 'intruder');
    expect(await store.findUnread('u2', tenant)).toHaveLength(1);
    await store.markRead(n.id, 'u2');
    expect(await store.findUnread('u2', tenant)).toHaveLength(0);
    await store.markAllRead('u2');
    expect(await store.findUnread('u2')).toHaveLength(0);
  });

  it('tracks one delivery row per channel through retries and provider callbacks', async () => {
    let calls = 0;
    const email: EmailAdapter = { async send() { calls += 1; if (calls === 1) throw new Error('smtp down'); return { id: `em-${run}` }; } };
    const notifications = new DefaultNotifications({ email, inApp: store, deliveries: store, preferences: store, attempts: 3 }, { logger: silent });
    const id = await notifications.notify(createContext({ logger: silent, tenantId: tenant }), {
      recipientUserId: 'u3', recipientTenantId: tenant, category: 'alerts', email: 'a@b.c',
      template: { id: 't', name: 't', subject: 'S', body: 'B', channel: 'email' }, variables: {},
    });
    const rows = await store.list(id);
    expect(rows.map((r) => [r.channel, r.status, r.attemptCount]).sort()).toEqual([['email', 'sent', 2], ['in_app', 'sent', 1]]);
    expect(await store.updateByExternalId(`em-${run}`, { status: 'delivered', deliveredAt: new Date() })).toBe(true);
    expect((await store.get(id, 'email'))?.status).toBe('delivered');
    expect(await store.updateByExternalId('unknown', { status: 'bounced' })).toBe(false);
  });
});

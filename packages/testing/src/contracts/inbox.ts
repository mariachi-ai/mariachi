import { describe, expect, it } from 'vitest';
import type { InAppNotificationStore } from '@mariachi/notifications';

/** Behavior every in-app inbox must share: Postgres, memory and the test double. */
export function inboxContract(name: string, create: () => InAppNotificationStore | Promise<InAppNotificationStore>) {
  describe(`in-app contract: ${name}`, () => {
    it('creates unread notifications that only the recipient can mark read', async () => {
      const store = await create();
      const user = `u-${crypto.randomUUID().slice(0, 8)}`;
      const created = await store.create({ userId: user, tenantId: 't1', title: 'Hi', body: 'There', type: 'info' });
      await store.create({ userId: user, tenantId: 't2', title: 'Other', body: 'Tenant', type: 'info' });
      expect((await store.findUnread(user, 't1')).map((n) => n.id)).toEqual([created.id]);
      await store.markRead(created.id, 'someone-else');
      expect(await store.findUnread(user, 't1')).toHaveLength(1);
      await store.markRead(created.id, user);
      expect(await store.findUnread(user, 't1')).toEqual([]);
      await store.markAllRead(user);
      expect(await store.findUnread(user)).toEqual([]);
    });
  });
}

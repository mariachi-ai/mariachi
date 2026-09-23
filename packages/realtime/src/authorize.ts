import type { ChannelAuthorizer } from './types';

/**
 * Default channel policy, deny-by-default:
 * - `public:<name>`: anyone may subscribe; publishing is denied.
 * - `tenant:<tenantId>[:...]`: members of that tenant only.
 * - `user:<userId>[:...]`: that user only (and only within their tenant, if the channel is tenant-prefixed).
 * - `tenant:<tenantId>:user:<userId>[:...]`: both checks.
 * Anything else is denied. Pass your own `authorize` to extend it.
 */
export const defaultChannelAuthorizer: ChannelAuthorizer = (identity, channel, action) => {
  const parts = channel.split(':');
  if (parts[0] === 'public') return action === 'subscribe' && parts.length > 1;
  let i = 0;
  if (parts[0] === 'tenant') {
    if (!identity.tenantId || parts[1] !== identity.tenantId) return false;
    i = 2;
    if (parts.length === 2) return true;
  }
  if (parts[i] === 'user') return parts[i + 1] === identity.userId;
  return i > 0 && parts.length > i;
};

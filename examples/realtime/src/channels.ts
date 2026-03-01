import type { ChannelAuthorizationFn } from '@mariachi/realtime';

export const authorizeChannel: ChannelAuthorizationFn = async (userId, tenantId, channel) => {
  if (channel.startsWith('notifications:')) {
    return channel === `notifications:${userId}`;
  }

  if (channel.startsWith('tenant:')) {
    const channelTenant = channel.split(':')[1];
    return channelTenant === tenantId;
  }

  if (channel.startsWith('chat:')) {
    return true;
  }

  if (channel === 'presence') {
    return true;
  }

  return false;
};

import { createHmac } from 'node:crypto';
import type { IceConfig } from '@orbit/shared';
import { env } from '../config/env.js';
export function iceConfig(userId: string): IceConfig {
  const iceServers: IceConfig['iceServers'] = [];
  const stun = env.STUN_URLS.split(',').filter(Boolean);
  if (stun.length) iceServers.push({ urls: stun });
  const turn = env.TURN_URLS.split(',').filter(Boolean);
  if (turn.length) {
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${userId}`;
    iceServers.push({
      urls: turn,
      username,
      credential: createHmac('sha1', env.TURN_SECRET).update(username).digest('base64'),
    });
  }
  return { iceServers, iceTransportPolicy: env.ICE_RELAY_ONLY === 'true' ? 'relay' : 'all' };
}

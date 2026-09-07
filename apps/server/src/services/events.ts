import { EventEmitter } from 'node:events';
export const events = new EventEmitter();
export function notify(users: string[], event = 'sync', data: unknown = {}) {
  events.emit('deliver', { users: [...new Set(users)], event, data });
}
export function evict(users: string[], conversationId?: string) {
  events.emit('evict', { users, conversationId });
}

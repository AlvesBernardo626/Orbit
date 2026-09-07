import type { Conversation } from '@orbit/shared';
export function conversationName(c: Conversation, me: string) {
  return c.kind === 'group'
    ? c.name
    : (c.members.find((m) => m.user.id !== me)?.user.displayName ?? 'Conversa');
}

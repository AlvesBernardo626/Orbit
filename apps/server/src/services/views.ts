import type { User, Message, Status } from '@orbit/shared';
import { Types } from 'mongoose';
export const onlineUsers = new Map<string, number>();
type UserRecord = {
  _id: Types.ObjectId;
  username: string;
  displayName: string;
  avatar?: string | null;
  banner?: string | null;
  bio?: string | null;
  status?: string | null;
  customStatus?: string | null;
};
export function publicUser(user: UserRecord): User {
  const id = String(user._id);
  return {
    id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar ?? '',
    banner: user.banner ?? '',
    bio: user.bio ?? '',
    customStatus: user.customStatus ?? '',
    status: onlineUsers.has(id) ? ((user.status as Status) ?? 'online') : 'offline',
  };
}
type MessageRecord = {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  authorId: Types.ObjectId;
  content: string;
  clientId: string;
  createdAt: Date;
  editedAt?: Date | null;
  deletedAt?: Date | null;
};
export function publicMessage(m: MessageRecord): Message {
  return {
    id: String(m._id),
    conversationId: String(m.conversationId),
    authorId: String(m.authorId),
    content: m.deletedAt ? '' : m.content,
    clientId: m.clientId,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deletedAt: m.deletedAt?.toISOString() ?? null,
    attachments: [],
  };
}

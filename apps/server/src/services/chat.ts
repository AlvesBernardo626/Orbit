import mongoose, { Types } from 'mongoose';
import { messageSchema, canManage, type Conversation, type Role } from '@orbit/shared';
import { ConversationModel, MessageModel, Group, UserModel, BlockedUser } from '../models/index.js';
import { ensure } from './errors.js';
import { pair, assertFriends, assertUnblocked, lockRelations } from './social.js';
import { publicUser, publicMessage } from './views.js';
import { notify } from './events.js';
export async function membership(userId: string, id: string, write = false) {
  const conversation = await ConversationModel.findOne({ _id: id, participants: userId });
  ensure(conversation, 404, 'Conversa não encontrada');
  if (conversation.kind === 'dm') {
    const other = conversation.participants.find((p) => String(p) !== userId);
    ensure(other, 404, 'Conversa indisponível');
    await assertUnblocked(userId, String(other));
    if (write) await assertFriends(userId, String(other));
  }
  return conversation;
}
async function mutation<T>(
  userId: string,
  id: string,
  write: boolean,
  fn: (c: InstanceType<typeof ConversationModel>) => Promise<T>,
) {
  return mongoose.connection.transaction(async () => {
    const existing = await ConversationModel.findOne({ _id: id, participants: userId });
    ensure(existing, 404, 'Conversa não encontrada');
    if (existing.kind === 'dm') await lockRelations(existing.participants.map(String));
    const c = await membership(userId, id, write);
    const result = await ConversationModel.updateOne(
      { _id: id, participants: userId },
      { $inc: { writeVersion: 1 } },
    );
    ensure(result.matchedCount, 404, 'Conversa não encontrada');
    return fn(c);
  });
}
async function publish(id: string, message: ReturnType<typeof publicMessage>) {
  const c = await ConversationModel.findById(id).lean();
  if (!c) return;
  if (c.kind === 'dm') {
    try {
      await assertUnblocked(String(c.participants[0]), String(c.participants[1]));
    } catch {
      return;
    }
  }
  notify(c.participants.map(String), 'message', message);
}
export async function conversations(userId: string): Promise<Conversation[]> {
  const [raw, blocks] = await Promise.all([
    ConversationModel.find({ participants: userId }).sort({ updatedAt: -1 }).limit(200).lean(),
    BlockedUser.find({ $or: [{ blocker: userId }, { blocked: userId }] }).lean(),
  ]);
  const blockedIds = new Set(
    blocks.map((b) => (String(b.blocker) === userId ? String(b.blocked) : String(b.blocker))),
  );
  const list = raw.filter(
    (c) => c.kind !== 'dm' || !c.participants.some((p) => blockedIds.has(String(p))),
  );
  const filters = list.map((c) => {
    const read = c.reads.find((r) => String(r.userId) === userId)?.messageId;
    return { conversationId: c._id, ...(read ? { _id: { $gt: read } } : {}) };
  });
  const [users, groups, counts] = await Promise.all([
    UserModel.find({ _id: { $in: list.flatMap((c) => c.participants) } }).lean(),
    Group.find({
      conversationId: { $in: list.filter((c) => c.kind === 'group').map((c) => c._id) },
    }).lean(),
    filters.length
      ? MessageModel.aggregate<{ _id: Types.ObjectId; count: number }>([
          {
            $match: {
              $or: filters,
              authorId: { $ne: new Types.ObjectId(userId) },
              deletedAt: null,
            },
          },
          { $group: { _id: '$conversationId', count: { $sum: 1 } } },
        ])
      : [],
  ]);
  return list.flatMap((c) => {
    const group = groups.find((g) => String(g.conversationId) === String(c._id));
    if (c.kind === 'group' && !group) return [];
    return [
      {
        id: String(c._id),
        kind: c.kind as 'dm' | 'group',
        name: group?.name ?? '',
        image: group?.image ?? '',
        groupId: group ? String(group._id) : undefined,
        updatedAt: c.updatedAt.toISOString(),
        unread: counts.find((n) => String(n._id) === String(c._id))?.count ?? 0,
        members: c.participants.flatMap((p) => {
          const u = users.find((u) => String(u._id) === String(p));
          return u
            ? [
                {
                  user: publicUser(u),
                  role: (group?.members.find((m) => String(m.userId) === String(p))?.role ??
                    'member') as Role,
                },
              ]
            : [];
        }),
      },
    ];
  });
}
export async function createDM(userId: string, target: string) {
  ensure(userId !== target, 400, 'Usuário inválido');
  const id = await mongoose.connection.transaction(async () => {
    await lockRelations([userId, target]);
    await assertFriends(userId, target);
    const c = await ConversationModel.findOneAndUpdate(
      { pair: pair(userId, target) },
      {
        $setOnInsert: {
          kind: 'dm',
          pair: pair(userId, target),
          participants: [userId, target],
          reads: [{ userId }, { userId: target }],
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return c!.id;
  });
  notify([userId, target]);
  return { id };
}
export async function history(userId: string, id: string, before?: string) {
  await membership(userId, id);
  const messages = await MessageModel.find({
    conversationId: id,
    ...(before ? { _id: { $lt: new Types.ObjectId(before) } } : {}),
  })
    .sort({ _id: -1 })
    .limit(51)
    .lean();
  const more = messages.length > 50;
  const page = messages.slice(0, 50);
  return {
    messages: page.reverse().map(publicMessage),
    nextCursor: more ? String(page[0]!._id) : null,
  };
}
export async function sendMessage(userId: string, id: string, input: unknown) {
  const data = messageSchema.parse(input);
  const output = await mutation(userId, id, true, async () => {
    const msg = await MessageModel.findOneAndUpdate(
      { conversationId: id, authorId: userId, clientId: data.clientId },
      { $setOnInsert: { conversationId: id, authorId: userId, ...data } },
      { upsert: true, returnDocument: 'after' },
    );
    return publicMessage(msg!);
  });
  await publish(id, output);
  return output;
}
export async function editMessage(userId: string, id: string, messageId: string, content: string) {
  const output = await mutation(userId, id, true, async () => {
    const msg = await MessageModel.findOneAndUpdate(
      { _id: messageId, conversationId: id, authorId: userId, deletedAt: null },
      { $set: { content, editedAt: new Date() } },
      { returnDocument: 'after' },
    );
    ensure(msg, 404, 'Mensagem não encontrada');
    return publicMessage(msg);
  });
  await publish(id, output);
  return output;
}
export async function deleteMessage(userId: string, id: string, messageId: string) {
  const output = await mutation(userId, id, false, async () => {
    const msg = await MessageModel.findOne({ _id: messageId, conversationId: id });
    ensure(msg, 404, 'Mensagem não encontrada');
    if (String(msg.authorId) !== userId) {
      const g = await Group.findOne({ conversationId: id });
      const actor = g?.members.find((m) => String(m.userId) === userId)?.role as Role | undefined;
      const target = g?.members.find((m) => String(m.userId) === String(msg.authorId))?.role as
        Role | undefined;
      ensure(actor && canManage(actor, target ?? 'member'));
    }
    msg.content = ' ';
    msg.deletedAt = new Date();
    await msg.save();
    return publicMessage(msg);
  });
  await publish(id, output);
}
export async function markRead(userId: string, id: string, messageId: string) {
  await membership(userId, id);
  ensure(await MessageModel.exists({ _id: messageId, conversationId: id }), 400, 'Cursor inválido');
  await ConversationModel.updateOne(
    { _id: id, participants: userId },
    { $max: { 'reads.$[r].messageId': new Types.ObjectId(messageId) } },
    { arrayFilters: [{ 'r.userId': new Types.ObjectId(userId) }], timestamps: false },
  );
  notify([userId], 'read', { conversationId: id, messageId });
}

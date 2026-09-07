import mongoose, { Types } from 'mongoose';
import { canManage, groupSchema, MAX_MEMBERS, type Role } from '@orbit/shared';
import { ConversationModel, Group, MessageModel } from '../models/index.js';
import { assertFriends, lockRelations } from './social.js';
import { ensure } from './errors.js';
import { notify, evict } from './events.js';
export async function createGroup(userId: string, input: unknown) {
  const data = groupSchema.parse(input);
  const members = [...new Set([userId, ...data.members])];
  let id = '';
  let conversationId = '';
  await mongoose.connection.transaction(async (session) => {
    await lockRelations(members);
    for (const memberId of members) {
      if (memberId !== userId) await assertFriends(userId, memberId);
      ensure(
        (await Group.countDocuments({ 'members.userId': memberId })) < 50,
        409,
        'Um participante atingiu o limite de grupos',
      );
    }
    const c = new ConversationModel({
      kind: 'group',
      participants: members,
      reads: members.map((userId) => ({ userId })),
    });
    await c.save({ session });
    const g = new Group({
      conversationId: c._id,
      name: data.name,
      image: data.image,
      members: members.map((id) => ({ userId: id, role: id === userId ? 'owner' : 'member' })),
    });
    await g.save({ session });
    id = g.id;
    conversationId = c.id;
  });
  notify(members);
  return { id, conversationId };
}
export async function updateGroup(
  userId: string,
  id: string,
  input: { name?: string; image?: string },
) {
  const g = await Group.findOne({
    _id: id,
    members: { $elemMatch: { userId, role: { $in: ['owner', 'admin'] } } },
  });
  ensure(g, 404, 'Grupo não encontrado');
  const result = await Group.updateOne(
    { _id: id, members: { $elemMatch: { userId, role: { $in: ['owner', 'admin'] } } } },
    { $set: input },
  );
  ensure(result.matchedCount, 403, 'Permissão de gerenciamento removida');
  notify(g.members.map((m) => String(m.userId)));
}
export async function mutateMember(
  userId: string,
  id: string,
  target: string,
  action: 'add' | 'remove' | 'leave' | 'admin' | 'member' | 'transfer',
) {
  let affected: string[] = [];
  let conversationId = '';
  await mongoose.connection.transaction(async (session) => {
    const g = await Group.findById(id).session(session);
    ensure(g, 404, 'Grupo não encontrado');
    conversationId = String(g.conversationId);
    affected = g.members.map((m) => String(m.userId));
    const actor = g.members.find((m) => String(m.userId) === userId);
    ensure(actor);
    const member = g.members.find((m) => String(m.userId) === target);
    if (action === 'add') {
      ensure(actor.role === 'owner' || actor.role === 'admin');
      ensure(!member && g.members.length < MAX_MEMBERS, 409, 'Grupo cheio ou usuário já é membro');
      await lockRelations([userId, target]);
      await assertFriends(userId, target);
      ensure(
        (await Group.countDocuments({ 'members.userId': target })) < 50,
        409,
        'Usuário atingiu o limite de grupos',
      );
      g.members.push({ userId: new Types.ObjectId(target), role: 'member' });
      await ConversationModel.updateOne(
        { _id: g.conversationId },
        { $addToSet: { participants: target }, $push: { reads: { userId: target } } },
        { session },
      );
      affected.push(target);
    } else {
      ensure(member, 404, 'Membro não encontrado');
      if (action === 'leave') {
        ensure(
          target === userId && actor.role !== 'owner',
          403,
          'Transfira a propriedade antes de sair',
        );
      } else if (action === 'remove') {
        ensure(canManage(actor.role as Role, member.role as Role));
      } else {
        ensure(actor.role === 'owner' && member.role !== 'owner');
        if (action === 'transfer') {
          actor.role = 'admin';
          member.role = 'owner';
        } else member.role = action;
      }
      if (action === 'remove' || action === 'leave') {
        g.members.pull(member);
        await ConversationModel.updateOne(
          { _id: g.conversationId },
          { $pull: { participants: target, reads: { userId: target } } },
          { session },
        );
      }
    }
    await g.save({ session });
  });
  if (action === 'remove' || action === 'leave') evict([target], conversationId);
  notify(affected);
}
export async function deleteGroup(userId: string, id: string) {
  let affected: string[] = [];
  let conversationId = '';
  await mongoose.connection.transaction(async (session) => {
    const g = await Group.findOne({
      _id: id,
      members: { $elemMatch: { userId, role: 'owner' } },
    }).session(session);
    ensure(g, 404, 'Grupo não encontrado');
    affected = g.members.map((m) => String(m.userId));
    conversationId = String(g.conversationId);
    await MessageModel.deleteMany({ conversationId: g.conversationId }, { session });
    await ConversationModel.deleteOne({ _id: g.conversationId }, { session });
    await g.deleteOne({ session });
  });
  evict(affected, conversationId);
  notify(affected);
}

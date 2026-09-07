import mongoose from 'mongoose';
import { profileSchema } from '@orbit/shared';
import { UserModel, Friendship, BlockedUser, ConversationModel } from '../models/index.js';
import { ensure } from './errors.js';
import { publicUser } from './views.js';
import { notify, evict } from './events.js';
export async function lockRelations(ids: string[]) {
  for (const id of [...new Set(ids)].sort())
    await UserModel.updateOne({ _id: id }, { $inc: { relationVersion: 1 } }, { timestamps: false });
}
export const pair = (a: string, b: string) => [a, b].sort().join(':');
export async function assertUnblocked(a: string, b: string) {
  ensure(
    !(await BlockedUser.exists({
      $or: [
        { blocker: a, blocked: b },
        { blocker: b, blocked: a },
      ],
    })),
    403,
    'Interação indisponível',
  );
}
export async function assertFriends(a: string, b: string) {
  await assertUnblocked(a, b);
  ensure(
    await Friendship.exists({ pair: pair(a, b), state: 'accepted' }),
    403,
    'É necessário ter uma amizade aceita',
  );
}
export async function contacts(id: string) {
  const [friends, conversations] = await Promise.all([
    Friendship.find({ $or: [{ requester: id }, { recipient: id }] }).lean(),
    ConversationModel.find({ participants: id }).select('participants').lean(),
  ]);
  return [
    ...new Set([
      id,
      ...friends.map((f) =>
        String(f.requester) === id ? String(f.recipient) : String(f.requester),
      ),
      ...conversations.flatMap((c) => c.participants.map(String)),
    ]),
  ];
}
export async function profile(id: string) {
  const user = await UserModel.findById(id);
  ensure(user, 404, 'Usuário não encontrado');
  return publicUser(user);
}
export async function updateProfile(id: string, input: unknown) {
  const data = profileSchema.parse(input);
  const user = await UserModel.findByIdAndUpdate(
    id,
    { $set: data },
    { returnDocument: 'after', runValidators: true },
  );
  ensure(user, 404, 'Usuário não encontrado');
  notify(await contacts(id));
  return publicUser(user);
}
export async function friends(id: string) {
  const list = await Friendship.find({ $or: [{ requester: id }, { recipient: id }] })
    .sort({ updatedAt: -1 })
    .lean();
  const users = await UserModel.find({
    _id: { $in: list.map((f) => (String(f.requester) === id ? f.recipient : f.requester)) },
  }).lean();
  return list.flatMap((f) => {
    const uid = String(f.requester) === id ? String(f.recipient) : String(f.requester);
    const u = users.find((u) => String(u._id) === uid);
    return u
      ? [
          {
            id: String(f._id),
            state: f.state as 'pending' | 'accepted',
            incoming: String(f.recipient) === id,
            user: publicUser(u),
          },
        ]
      : [];
  });
}
export async function blocked(id: string) {
  const list = await BlockedUser.find({ blocker: id }).lean();
  return (await UserModel.find({ _id: { $in: list.map((b) => b.blocked) } }).lean()).map(
    publicUser,
  );
}
export async function requestFriend(id: string, username: string) {
  const target = await UserModel.findOne({ username });
  ensure(target, 404, 'Usuário não encontrado');
  ensure(target.id !== id, 400, 'Você não pode adicionar a si mesmo');
  await mongoose.connection.transaction(async () => {
    await lockRelations([id, target.id]);
    await assertUnblocked(id, target.id);
    ensure(
      (await Friendship.countDocuments({ $or: [{ requester: id }, { recipient: id }] })) < 200,
      409,
      'Limite de 200 amizades/solicitações atingido',
    );
    ensure(
      (await Friendship.countDocuments({
        $or: [{ requester: target.id }, { recipient: target.id }],
      })) < 200,
      409,
      'Usuário não pode receber mais solicitações',
    );
    await Friendship.create({
      pair: pair(id, target.id),
      requester: id,
      recipient: target.id,
      state: 'pending',
    });
  });
  notify([id, target.id]);
}
export async function actFriend(
  id: string,
  friendId: string,
  action: 'accept' | 'decline' | 'cancel' | 'remove',
) {
  let affected: string[] = [];
  await mongoose.connection.transaction(async () => {
    const f = await Friendship.findById(friendId);
    ensure(f, 404, 'Solicitação não encontrada');
    const a = String(f.requester),
      b = String(f.recipient);
    affected = [a, b];
    await lockRelations(affected);
    ensure(a === id || b === id);
    if (action === 'accept') {
      ensure(b === id && f.state === 'pending');
      await assertUnblocked(a, b);
      await Friendship.updateOne({ _id: f._id, state: 'pending' }, { $set: { state: 'accepted' } });
    } else {
      ensure(
        action === 'remove'
          ? f.state === 'accepted'
          : f.state === 'pending' && (action === 'cancel' ? a === id : b === id),
      );
      await f.deleteOne();
    }
  });
  if (action === 'remove') evict(affected);
  notify(affected);
}
export async function block(id: string, target: string) {
  ensure(id !== target, 400, 'Usuário inválido');
  ensure(await UserModel.exists({ _id: target }), 404, 'Usuário não encontrado');
  await mongoose.connection.transaction(async (session) => {
    await lockRelations([id, target]);
    ensure(
      (await BlockedUser.countDocuments({ blocker: id })) < 200,
      409,
      'Limite de bloqueios atingido',
    );
    await BlockedUser.updateOne(
      { blocker: id, blocked: target },
      { $setOnInsert: { blocker: id, blocked: target } },
      { upsert: true, session },
    );
    await Friendship.deleteOne({ pair: pair(id, target) }, { session });
  });
  evict([id, target]);
  notify([id, target]);
}
export async function unblock(id: string, target: string) {
  await mongoose.connection.transaction(async () => {
    await lockRelations([id, target]);
    await BlockedUser.deleteOne({ blocker: id, blocked: target });
  });
  notify([id]);
}

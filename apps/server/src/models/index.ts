import mongoose, { Schema } from 'mongoose';
mongoose.set('transactionAsyncLocalStorage', true);
const ref = { type: Schema.Types.ObjectId, required: true };
const userSchema = new Schema(
  {
    relationVersion: { type: Number, default: 0, select: false },
    username: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: '' },
    banner: { type: String, default: '' },
    bio: { type: String, default: '' },
    status: { type: String, enum: ['online', 'away', 'busy', 'offline'], default: 'online' },
    customStatus: { type: String, default: '' },
  },
  { timestamps: true },
);
export const UserModel = mongoose.model('User', userSchema);
const sessionSchema = new Schema(
  {
    userId: ref,
    tokenHash: { type: String, required: true, unique: true },
    previousHash: { type: String, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1 });
export const SessionModel = mongoose.model('Session', sessionSchema);
const friendSchema = new Schema(
  {
    pair: { type: String, required: true, unique: true },
    requester: ref,
    recipient: ref,
    state: { type: String, enum: ['pending', 'accepted'], required: true },
  },
  { timestamps: true },
);
friendSchema.index({ requester: 1, state: 1 });
friendSchema.index({ recipient: 1, state: 1 });
export const Friendship = mongoose.model('Friendship', friendSchema);
const blockSchema = new Schema({ blocker: ref, blocked: ref }, { timestamps: true });
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
blockSchema.index({ blocked: 1, blocker: 1 });
export const BlockedUser = mongoose.model('BlockedUser', blockSchema);
const conversationSchema = new Schema(
  {
    writeVersion: { type: Number, default: 0, select: false },
    kind: { type: String, enum: ['dm', 'group'], required: true },
    pair: { type: String },
    participants: [Schema.Types.ObjectId],
    reads: [{ _id: false, userId: ref, messageId: { type: Schema.Types.ObjectId } }],
  },
  { timestamps: true },
);
conversationSchema.index(
  { pair: 1 },
  { unique: true, partialFilterExpression: { pair: { $type: 'string' } } },
);
conversationSchema.index({ participants: 1, updatedAt: -1 });
export const ConversationModel = mongoose.model('Conversation', conversationSchema);
const groupSchema = new Schema(
  {
    conversationId: { ...ref, unique: true },
    name: { type: String, required: true },
    image: { type: String, default: '' },
    members: [
      {
        _id: false,
        userId: ref,
        role: { type: String, enum: ['owner', 'admin', 'member'], required: true },
      },
    ],
  },
  { timestamps: true },
);
groupSchema.index({ 'members.userId': 1 });
export const Group = mongoose.model('Group', groupSchema);
const messageModelSchema = new Schema(
  {
    conversationId: ref,
    authorId: ref,
    content: { type: String, required: true, maxlength: 4000 },
    clientId: { type: String, required: true },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
messageModelSchema.index({ conversationId: 1, _id: -1 });
messageModelSchema.index({ conversationId: 1, authorId: 1, clientId: 1 }, { unique: true });
export const MessageModel = mongoose.model('Message', messageModelSchema);
// Reserved for an email-verification/recovery flow. Never issue recovery tokens without verified delivery.
const recoverySchema = new Schema({
  userId: ref,
  tokenHash: { type: String, unique: true, required: true },
  expiresAt: { type: Date, required: true },
  usedAt: Date,
});
recoverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const PasswordRecovery = mongoose.model('PasswordRecovery', recoverySchema);
export async function createIndexes() {
  for (const model of [
    UserModel,
    SessionModel,
    Friendship,
    BlockedUser,
    ConversationModel,
    Group,
    MessageModel,
    PasswordRecovery,
  ])
    await model.createIndexes();
}

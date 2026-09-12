import { events } from './events.js';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loginSchema, registerSchema } from '@orbit/shared';
import { SessionModel, UserModel } from '../models/index.js';
import { env } from '../config/env.js';
import { ensure } from './errors.js';
import { publicUser } from './views.js';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const duration = 30 * 24 * 3600 * 1000;
const dummyHash = bcrypt.hashSync('orbit-invalid-login-dummy-value', 12);
export function accessToken(userId: string, sessionId: string) {
  return jwt.sign({ sid: sessionId }, env.JWT_SECRET, {
    subject: userId,
    algorithm: 'HS256',
    expiresIn: '15m',
    issuer: 'orbit-api',
    audience: 'orbit-desktop',
  });
}
export async function authenticate(token: string) {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'orbit-api',
    audience: 'orbit-desktop',
  });
  ensure(
    typeof payload !== 'string' &&
      typeof payload.sub === 'string' &&
      typeof payload.sid === 'string',
    401,
    'Sessão inválida',
  );
  const session = await SessionModel.findOne({
    _id: payload.sid,
    userId: payload.sub,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();
  ensure(session, 401, 'Sessão encerrada');
  return { userId: payload.sub, sessionId: payload.sid, exp: payload.exp! };
}
async function issue(user: InstanceType<typeof UserModel>) {
  const refreshToken = randomBytes(48).toString('base64url');
  const session = await SessionModel.create({
    userId: user._id,
    tokenHash: digest(refreshToken),
    expiresAt: new Date(Date.now() + duration),
  });
  return { accessToken: accessToken(user.id, session.id), refreshToken, user: publicUser(user) };
}
export async function register(input: unknown) {
  ensure(env.REGISTRATION_ENABLED === 'true', 403, 'Cadastros fechados');
  const data = registerSchema.parse(input);
  const user = await UserModel.create({
    username: data.username,
    displayName: data.displayName,
    passwordHash: await bcrypt.hash(data.password, 12),
  });
  return issue(user);
}
export async function login(input: unknown) {
  const data = loginSchema.parse(input);
  const user = await UserModel.findOne({ username: data.username }).select('+passwordHash');
  const valid = await bcrypt.compare(data.password, user?.passwordHash ?? dummyHash);
  ensure(user && valid, 401, 'Usuário ou senha inválidos');
  return issue(user);
}
const REUSE_GRACE_MS = 15_000;
export async function refresh(token: string) {
  const next = randomBytes(48).toString('base64url');
  const hash = digest(token);
  const now = new Date();
  let session = await SessionModel.findOneAndUpdate(
    { tokenHash: hash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { tokenHash: digest(next), previousHash: hash, previousHashAt: now } },
    { returnDocument: 'after' },
  );
  if (!session) {
    // The client may have crashed after our previous rotation committed but before it
    // persisted the new token to disk. Tolerate one retry with the just-rotated-from
    // token within a short grace window instead of treating it as reuse.
    session = await SessionModel.findOneAndUpdate(
      {
        previousHash: hash,
        revokedAt: null,
        expiresAt: { $gt: now },
        previousHashAt: { $gt: new Date(now.getTime() - REUSE_GRACE_MS) },
      },
      { $set: { tokenHash: digest(next), previousHashAt: now } },
      { returnDocument: 'after' },
    );
  }
  if (!session) {
    const revoked = await SessionModel.find({ previousHash: hash });
    await SessionModel.updateMany({ previousHash: hash }, { $set: { revokedAt: new Date() } });
    for (const item of revoked) events.emit('revoke', item.id);
    ensure(false, 401, 'Sessão expirada; entre novamente');
  }
  const user = await UserModel.findById(session.userId);
  ensure(user, 401, 'Sessão inválida');
  return {
    accessToken: accessToken(user.id, session.id),
    refreshToken: next,
    user: publicUser(user),
  };
}
export async function logout(sessionId: string) {
  await SessionModel.updateOne({ _id: sessionId }, { $set: { revokedAt: new Date() } });
  events.emit('revoke', sessionId);
}

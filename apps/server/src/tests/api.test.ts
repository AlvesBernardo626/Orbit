import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
let repl: MongoMemoryReplSet;
let app: import('express').Express;
let alice: { accessToken: string; refreshToken: string; user: { id: string } };
beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: '8.0.12' },
  });
  Object.assign(process.env, {
    NODE_ENV: 'test',
    PORT: '3001',
    MONGODB_URI: repl.getUri(),
    JWT_SECRET: 'a'.repeat(64),
    CORS_ORIGINS: 'orbit://app',
  });
  await mongoose.connect(repl.getUri());
  const { createApp, errorHandler } = await import('../app.js');
  app = createApp();
  app.use(errorHandler);
  const { createIndexes } = await import('../models/index.js');
  await createIndexes();
}, 120000);
afterAll(async () => {
  await mongoose.disconnect();
  await repl?.stop();
});
describe('autenticação real com MongoDB', () => {
  it('cria usuário sem expor hash e rejeita duplicatas', async () => {
    const r = await request(app)
      .post('/api/auth/register')
      .send({ username: 'alice', displayName: 'Alice', password: 'a-strong-password!' })
      .expect(201);
    alice = r.body;
    expect(r.body.user.passwordHash).toBeUndefined();
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'alice', displayName: 'Alice', password: 'a-strong-password!' })
      .expect(409);
  });
  it('rejeita senha incorreta e injeção NoSQL', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'incorrect' })
      .expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ username: { $ne: null }, password: 'incorrect' })
      .expect(400);
  });
  it('rotaciona e revoga ao reutilizar refresh token', async () => {
    const r = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: alice.refreshToken })
      .expect(200);
    expect(r.body.refreshToken).not.toBe(alice.refreshToken);
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: alice.refreshToken })
      .expect(401);
    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: r.body.refreshToken })
      .expect(401);
  });
  it('logout revoga acesso imediatamente', async () => {
    const r = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'a-strong-password!' })
      .expect(200);
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${r.body.accessToken}`)
      .expect(204);
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${r.body.accessToken}`)
      .expect(401);
  });
  it('restringe CORS', async () => {
    await request(app).get('/health/live').set('Origin', 'https://untrusted.example').expect(403);
  });
});

describe('perfis, amizade e bloqueio', () => {
  let bob: { accessToken: string; user: { id: string } };
  beforeAll(async () => {
    alice = (
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'alice', password: 'a-strong-password!' })
    ).body;
    bob = (
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'bob', displayName: 'Bob', password: 'b-strong-password!' })
    ).body;
  });
  it('edita somente o próprio perfil e valida URLs', async () => {
    await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ bio: 'Olá!', avatar: 'https://example.com/avatar.png' })
      .expect(200);
    await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ passwordHash: 'oops' })
      .expect(400);
    await request(app).get('/api/me').expect(401);
  });
  it('somente destinatário aceita solicitação', async () => {
    await request(app)
      .post('/api/friends')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ username: 'bob' })
      .expect(204);
    const list = (
      await request(app).get('/api/friends').set('Authorization', `Bearer ${alice.accessToken}`)
    ).body;
    await request(app)
      .post(`/api/friends/${list[0].id}/accept`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(403);
    await request(app)
      .post(`/api/friends/${list[0].id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(204);
  });
  it('bloqueio remove amizade e impede solicitação inversa', async () => {
    await request(app)
      .post(`/api/blocks/${bob.user.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(204);
    await request(app)
      .post('/api/friends')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ username: 'alice' })
      .expect(403);
    expect(
      (await request(app).get('/api/friends').set('Authorization', `Bearer ${alice.accessToken}`))
        .body,
    ).toHaveLength(0);
    await request(app)
      .delete(`/api/blocks/${bob.user.id}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(204);
  });
});

describe('DMs e paginação', () => {
  let bob: { accessToken: string; user: { id: string } };
  let stranger: { accessToken: string };
  let conversationId: string;
  let messageId: string;
  beforeAll(async () => {
    bob = (
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'bob', password: 'b-strong-password!' })
    ).body;
    stranger = (
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'stranger', displayName: 'Stranger', password: 'stranger-password!' })
    ).body;
    await request(app)
      .post('/api/friends')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ username: 'bob' });
    const list = (
      await request(app).get('/api/friends').set('Authorization', `Bearer ${bob.accessToken}`)
    ).body;
    await request(app)
      .post(`/api/friends/${list[0].id}/accept`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    conversationId = (
      await request(app)
        .post('/api/conversations/dm')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ userId: bob.user.id })
    ).body.id;
  });
  it('mensagem idempotente e autorização de leitura', async () => {
    const data = { content: 'Olá <script>alert(1)</script>', clientId: crypto.randomUUID() };
    messageId = (
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send(data)
        .expect(201)
    ).body.id;
    expect(
      (
        await request(app)
          .post(`/api/conversations/${conversationId}/messages`)
          .set('Authorization', `Bearer ${alice.accessToken}`)
          .send(data)
          .expect(201)
      ).body.id,
    ).toBe(messageId);
    await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(404);
  });
  it('apenas autor edita; leitura remove badge', async () => {
    await request(app)
      .patch(`/api/conversations/${conversationId}/messages/${messageId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ content: 'hack' })
      .expect(404);
    expect(
      (
        await request(app)
          .get('/api/conversations')
          .set('Authorization', `Bearer ${bob.accessToken}`)
      ).body[0].unread,
    ).toBe(1);
    await request(app)
      .post(`/api/conversations/${conversationId}/read`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ messageId })
      .expect(204);
    expect(
      (
        await request(app)
          .get('/api/conversations')
          .set('Authorization', `Bearer ${bob.accessToken}`)
      ).body[0].unread,
    ).toBe(0);
  });
  it('pagina sem duplicatas', async () => {
    const { MessageModel } = await import('../models/index.js');
    await MessageModel.insertMany(
      Array.from({ length: 55 }, (_, i) => ({
        conversationId,
        authorId: alice.user.id,
        content: `Mensagem ${i}`,
        clientId: crypto.randomUUID(),
      })),
    );
    const page = (
      await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
    ).body;
    expect(page.messages).toHaveLength(50);
    const older = (
      await request(app)
        .get(`/api/conversations/${conversationId}/messages?before=${page.nextCursor}`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
    ).body;
    expect(older.messages).toHaveLength(6);
    expect(new Set([...page.messages, ...older.messages].map((m) => m.id)).size).toBe(56);
  });
});

describe('grupos e permissões', () => {
  let bob: { accessToken: string; user: { id: string } };
  let groupId: string;
  let conversationId: string;
  beforeAll(async () => {
    bob = (
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'bob', password: 'b-strong-password!' })
    ).body;
  });
  it('cria grupo e impede membro de administrar', async () => {
    const group = (
      await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${alice.accessToken}`)
        .send({ name: 'Amigos', members: [bob.user.id] })
        .expect(201)
    ).body;
    groupId = group.id;
    conversationId = group.conversationId;
    await request(app)
      .patch(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ name: 'invadido' })
      .expect(404);
    await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ userId: alice.user.id, action: 'remove' })
      .expect(403);
  });
  it('admin não remove proprietário; removido perde acesso', async () => {
    await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ userId: bob.user.id, action: 'admin' })
      .expect(204);
    await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ userId: alice.user.id, action: 'remove' })
      .expect(403);
    await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ userId: bob.user.id, action: 'remove' })
      .expect(204);
    await request(app)
      .get(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(404);
    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ content: 'invasão', clientId: crypto.randomUUID() })
      .expect(404);
  });
  it('proprietário deve transferir antes de sair e pode excluir', async () => {
    await request(app)
      .post(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ userId: alice.user.id, action: 'leave' })
      .expect(403);
    await request(app)
      .delete(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .expect(404);
    await request(app)
      .delete(`/api/groups/${groupId}`)
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .expect(204);
  });
});

describe('Socket.IO: isolamento, signaling e revogação', () => {
  let http: import('node:http').Server;
  let io: import('socket.io').Server;
  let first: import('socket.io-client').Socket;
  let second: import('socket.io-client').Socket;
  let third: import('socket.io-client').Socket;
  let userA: import('@orbit/shared').AuthResult;
  let userB: import('@orbit/shared').AuthResult;
  let room: string;
  const ack = async (socket: import('socket.io-client').Socket, event: string, input: unknown) =>
    socket.timeout(3000).emitWithAck(event, input);
  beforeAll(async () => {
    const { createServer } = await import('node:http');
    const { attachSockets } = await import('../socket/index.js');
    http = createServer(app);
    io = attachSockets(http);
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const port = (http.address() as import('node:net').AddressInfo).port;
    const auth = await import('../services/auth.js');
    userA = await auth.register({
      username: 'socket_a',
      displayName: 'A',
      password: 'socket-password-123',
    });
    userB = await auth.register({
      username: 'socket_b',
      displayName: 'B',
      password: 'socket-password-123',
    });
    const userC = await auth.register({
      username: 'socket_c',
      displayName: 'C',
      password: 'socket-password-123',
    });
    const social = await import('../services/social.js');
    await social.requestFriend(userA.user.id, 'socket_b');
    const f = await social.friends(userB.user.id);
    await social.actFriend(userB.user.id, f[0]!.id, 'accept');
    room = (await (await import('../services/chat.js')).createDM(userA.user.id, userB.user.id)).id;
    const { io: client } = await import('socket.io-client');
    const connect = (token: string) =>
      new Promise<import('socket.io-client').Socket>((resolve, reject) => {
        const socket = client(`http://127.0.0.1:${port}`, {
          transports: ['websocket'],
          extraHeaders: { Origin: 'orbit://app' },
          auth: { token },
          reconnection: false,
        });
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
      });
    [first, second, third] = await Promise.all([
      connect(userA.accessToken),
      connect(userB.accessToken),
      connect(userC.accessToken),
    ]);
  });
  afterAll(async () => {
    first?.disconnect();
    second?.disconnect();
    third?.disconnect();
    await new Promise<void>((resolve) => io?.close(() => resolve()));
  });
  it('não membro não entra nem envia digitação; membro entra', async () => {
    expect((await ack(third, 'call:join', { conversationId: room })).ok).toBe(false);
    expect((await ack(third, 'typing', { conversationId: room })).ok).toBe(false);
    expect((await ack(first, 'call:join', { conversationId: room })).ok).toBe(true);
    expect((await ack(second, 'call:join', { conversationId: room })).ok).toBe(true);
  });
  it('sinaliza apenas entre participantes da mesma chamada', async () => {
    const received = new Promise<{ from: string }>((resolve) =>
      second.once('call:signal', resolve),
    );
    expect(
      (
        await ack(first, 'call:signal', {
          to: second.id,
          description: { type: 'offer', sdp: 'v=0' },
        })
      ).ok,
    ).toBe(true);
    expect((await received).from).toBe(first.id);
    expect(
      (
        await ack(first, 'call:signal', {
          to: third.id,
          description: { type: 'offer', sdp: 'v=0' },
        })
      ).ok,
    ).toBe(false);
  });
  it('bloqueio encerra chamada e impede reentrada', async () => {
    const ended = new Promise<void>((resolve) => first.once('call:ended', () => resolve()));
    await (await import('../services/social.js')).block(userA.user.id, userB.user.id);
    await ended;
    expect((await ack(first, 'call:join', { conversationId: room })).ok).toBe(false);
  });
  it('logout encerra socket imediatamente', async () => {
    const disconnected = new Promise<void>((resolve) => second.once('disconnect', () => resolve()));
    const auth = await import('../services/auth.js');
    const session = await auth.authenticate(userB.accessToken);
    await auth.logout(session.sessionId);
    await disconnected;
    expect(second.connected).toBe(false);
  });
});

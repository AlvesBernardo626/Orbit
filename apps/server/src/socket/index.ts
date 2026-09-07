import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { z } from 'zod';
import { idSchema, signalSchema, MAX_MEMBERS, type CallPeer, type Ack } from '@orbit/shared';
import { origins } from '../config/env.js';
import { authenticate } from '../services/auth.js';
import { membership } from '../services/chat.js';
import { assertUnblocked, contacts } from '../services/social.js';
import { onlineUsers } from '../services/views.js';
import { events, notify } from '../services/events.js';
import { ensure } from '../services/errors.js';
export function attachSockets(server: HttpServer) {
  const io = new Server(server, {
    cors: { origin: origins },
    allowRequest: (req, cb) =>
      cb(null, Boolean(req.headers.origin && origins.includes(req.headers.origin))),
    maxHttpBufferSize: 80000,
    pingInterval: 20000,
    pingTimeout: 15000,
  });
  const calls = new Map<string, Map<string, CallPeer>>();
  const locations = new Map<string, string>();
  let mutations: Promise<unknown> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>) => {
    const next = mutations.then(fn);
    mutations = next.catch(() => undefined);
    return next;
  };
  const peers = (id: string) => [...(calls.get(id)?.values() ?? [])];
  const broadcast = (id: string) => {
    for (const p of peers(id))
      io.to(p.socketId).emit('call:peers', { conversationId: id, peers: peers(id) });
  };
  const leave = (socketId: string) => {
    const id = locations.get(socketId);
    if (!id) return;
    calls.get(id)?.delete(socketId);
    locations.delete(socketId);
    broadcast(id);
    if (!calls.get(id)?.size) calls.delete(id);
  };
  const deliver = ({ users, event, data }: { users: string[]; event: string; data: unknown }) => {
    for (const id of users) io.to(`user:${id}`).emit(event, data);
  };
  const evict = ({ users, conversationId }: { users: string[]; conversationId?: string }) => {
    for (const [socketId, id] of locations) {
      const peer = calls.get(id)?.get(socketId);
      if (peer && users.includes(peer.userId) && (!conversationId || conversationId === id)) {
        leave(socketId);
        io.to(socketId).emit('call:ended', {
          reason: 'Sua participação na chamada foi encerrada.',
        });
      }
    }
  };
  const queuedEvict = (input: Parameters<typeof evict>[0]) => {
    void serialize(async () => evict(input));
  };
  events.on('deliver', deliver);
  events.on('evict', queuedEvict);
  io.use(async (socket, next) => {
    try {
      const token = z.string().min(1).max(4096).parse(socket.handshake.auth.token);
      socket.data.auth = await authenticate(token);
      socket.data.token = token;
      ensure((onlineUsers.get(socket.data.auth.userId) ?? 0) < 4, 429, 'Muitas sessões conectadas');
      next();
    } catch {
      next(new Error('Autenticação necessária'));
    }
  });
  io.on('connection', (socket) => {
    const userId: string = socket.data.auth.userId;
    onlineUsers.set(userId, (onlineUsers.get(userId) ?? 0) + 1);
    void contacts(userId)
      .then((ids) => notify(ids))
      .catch(() => undefined);
    void socket.join(`user:${userId}`);
    let windowStart = Date.now();
    let packets = 0;
    let lastTyping = 0;
    socket.use(async (_packet, next) => {
      try {
        if (Date.now() - windowStart > 1000) {
          windowStart = Date.now();
          packets = 0;
        }
        ensure(++packets <= 160, 429, 'Muitos eventos');
        await authenticate(socket.data.token);
        next();
      } catch {
        socket.disconnect(true);
      }
    });
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.auth.exp * 1000 - Date.now()),
    );
    const handle = <T>(event: string, fn: (input: unknown) => Promise<T>) =>
      socket.on(event, async (input: unknown, ack: Ack<T>) => {
        if (typeof ack !== 'function') return;
        try {
          ack({ ok: true, data: await fn(input) });
        } catch (error) {
          ack({
            ok: false,
            error: error instanceof Error ? error.message : 'Operação indisponível',
          });
        }
      });
    handle('typing', async (input) => {
      const { conversationId } = z.object({ conversationId: idSchema }).strict().parse(input);
      const c = await membership(userId, conversationId, true);
      if (Date.now() - lastTyping > 1500) {
        lastTyping = Date.now();
        notify(
          c.participants.map(String).filter((id) => id !== userId),
          'typing',
          { conversationId, userId },
        );
      }
      return {};
    });
    handle('call:join', (input) =>
      serialize(async () => {
        const { conversationId } = z.object({ conversationId: idSchema }).strict().parse(input);
        await membership(userId, conversationId, true);
        const existing = peers(conversationId);
        ensure(
          existing.length < MAX_MEMBERS || locations.get(socket.id) === conversationId,
          409,
          'Chamada cheia',
        );
        ensure(
          !existing.some((p) => p.userId === userId && p.socketId !== socket.id),
          409,
          'Você já está na chamada em outro dispositivo',
        );
        for (const p of existing) if (p.userId !== userId) await assertUnblocked(userId, p.userId);
        leave(socket.id);
        if (!calls.has(conversationId)) calls.set(conversationId, new Map());
        calls
          .get(conversationId)!
          .set(socket.id, { socketId: socket.id, userId, muted: false, sharing: false });
        locations.set(socket.id, conversationId);
        broadcast(conversationId);
        return { peers: peers(conversationId) };
      }),
    );
    handle('call:leave', async () => {
      leave(socket.id);
      return {};
    });
    handle('call:state', async (input) => {
      const state = z.object({ muted: z.boolean(), sharing: z.boolean() }).strict().parse(input);
      const id = locations.get(socket.id);
      ensure(id);
      await membership(userId, id, true);
      const p = calls.get(id)?.get(socket.id);
      ensure(p);
      Object.assign(p, state);
      broadcast(id);
      return {};
    });
    handle('call:signal', async (input) => {
      const signal = signalSchema.parse(input);
      const id = locations.get(socket.id);
      ensure(id);
      const target = calls.get(id)?.get(signal.to);
      ensure(target);
      await membership(userId, id, true);
      await membership(target.userId, id, true);
      await assertUnblocked(userId, target.userId);
      io.to(signal.to).emit('call:signal', {
        from: socket.id,
        description: signal.description,
        candidate: signal.candidate,
      });
      return {};
    });
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      leave(socket.id);
      const remaining = (onlineUsers.get(userId) ?? 1) - 1;
      if (remaining > 0) onlineUsers.set(userId, remaining);
      else onlineUsers.delete(userId);
      void contacts(userId)
        .then((ids) => notify(ids))
        .catch(() => undefined);
    });
  });
  const revoke = (sessionId: string) => {
    for (const socket of io.sockets.sockets.values())
      if (socket.data.auth.sessionId === sessionId) socket.disconnect(true);
  };
  events.on('revoke', revoke);
  const cleanup = () => {
    events.off('deliver', deliver);
    events.off('evict', queuedEvict);
    events.off('revoke', revoke);
  };
  server.on('close', cleanup);
  return io;
}

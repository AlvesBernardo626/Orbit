import { iceConfig } from '../services/ice.js';
import { Router } from 'express';
import { z } from 'zod';
import { idSchema, usernameSchema, messageSchema, groupSchema } from '@orbit/shared';
import { requireAuth } from '../middlewares/auth.js';
import * as groups from '../services/groups.js';
import * as chat from '../services/chat.js';
import * as social from '../services/social.js';
export const apiRoutes = Router();
apiRoutes.use(requireAuth);
apiRoutes.get('/me', async (req, res) => res.json(await social.profile(req.auth.userId)));
apiRoutes.patch('/me', async (req, res) =>
  res.json(await social.updateProfile(req.auth.userId, req.body)),
);
apiRoutes.get('/users/:id', async (req, res) =>
  res.json(await social.profile(idSchema.parse(req.params.id))),
);
apiRoutes.get('/friends', async (req, res) => res.json(await social.friends(req.auth.userId)));
apiRoutes.post('/friends', async (req, res) => {
  const { username } = z.object({ username: usernameSchema }).strict().parse(req.body);
  await social.requestFriend(req.auth.userId, username);
  res.sendStatus(204);
});
apiRoutes.post('/friends/:id/:action', async (req, res) => {
  await social.actFriend(
    req.auth.userId,
    idSchema.parse(req.params.id),
    z.enum(['accept', 'decline', 'cancel', 'remove']).parse(req.params.action),
  );
  res.sendStatus(204);
});
apiRoutes.get('/blocks', async (req, res) => res.json(await social.blocked(req.auth.userId)));
apiRoutes.post('/blocks/:id', async (req, res) => {
  await social.block(req.auth.userId, idSchema.parse(req.params.id));
  res.sendStatus(204);
});
apiRoutes.delete('/blocks/:id', async (req, res) => {
  await social.unblock(req.auth.userId, idSchema.parse(req.params.id));
  res.sendStatus(204);
});

apiRoutes.get('/conversations', async (req, res) =>
  res.json(await chat.conversations(req.auth.userId)),
);
apiRoutes.post('/conversations/dm', async (req, res) => {
  const { userId } = z.object({ userId: idSchema }).strict().parse(req.body);
  res.status(201).json(await chat.createDM(req.auth.userId, userId));
});
apiRoutes.get('/conversations/:id/messages', async (req, res) =>
  res.json(
    await chat.history(
      req.auth.userId,
      idSchema.parse(req.params.id),
      idSchema.optional().parse(req.query.before),
    ),
  ),
);
apiRoutes.post('/conversations/:id/messages', async (req, res) =>
  res
    .status(201)
    .json(await chat.sendMessage(req.auth.userId, idSchema.parse(req.params.id), req.body)),
);
apiRoutes.patch('/conversations/:id/messages/:messageId', async (req, res) => {
  const { content } = messageSchema.omit({ clientId: true }).parse(req.body);
  res.json(
    await chat.editMessage(
      req.auth.userId,
      idSchema.parse(req.params.id),
      idSchema.parse(req.params.messageId),
      content,
    ),
  );
});
apiRoutes.delete('/conversations/:id/messages/:messageId', async (req, res) => {
  await chat.deleteMessage(
    req.auth.userId,
    idSchema.parse(req.params.id),
    idSchema.parse(req.params.messageId),
  );
  res.sendStatus(204);
});
apiRoutes.post('/conversations/:id/read', async (req, res) => {
  const { messageId } = z.object({ messageId: idSchema }).strict().parse(req.body);
  await chat.markRead(req.auth.userId, idSchema.parse(req.params.id), messageId);
  res.sendStatus(204);
});

apiRoutes.post('/groups', async (req, res) =>
  res.status(201).json(await groups.createGroup(req.auth.userId, req.body)),
);
apiRoutes.patch('/groups/:id', async (req, res) => {
  await groups.updateGroup(
    req.auth.userId,
    idSchema.parse(req.params.id),
    groupSchema.pick({ name: true, image: true }).partial().parse(req.body),
  );
  res.sendStatus(204);
});
apiRoutes.delete('/groups/:id', async (req, res) => {
  await groups.deleteGroup(req.auth.userId, idSchema.parse(req.params.id));
  res.sendStatus(204);
});
apiRoutes.post('/groups/:id/members', async (req, res) => {
  const { userId, action } = z
    .object({
      userId: idSchema,
      action: z.enum(['add', 'remove', 'leave', 'admin', 'member', 'transfer']),
    })
    .strict()
    .parse(req.body);
  await groups.mutateMember(req.auth.userId, idSchema.parse(req.params.id), userId, action);
  res.sendStatus(204);
});
apiRoutes.get('/bootstrap', async (req, res) => {
  const [me, friends, blocked, conversations] = await Promise.all([
    social.profile(req.auth.userId),
    social.friends(req.auth.userId),
    social.blocked(req.auth.userId),
    chat.conversations(req.auth.userId),
  ]);
  res.json({ me, friends, blocked, conversations });
});

apiRoutes.get('/rtc/config', (req, res) => res.json(iceConfig(req.auth.userId)));

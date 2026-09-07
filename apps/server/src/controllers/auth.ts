import { createHash } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import * as auth from '../services/auth.js';
import { requireAuth } from '../middlewares/auth.js';
export const authRoutes = Router();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.' },
});
authRoutes.use(limiter);
authRoutes.post('/register', async (req, res) =>
  res.status(201).json(await auth.register(req.body)),
);
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    createHash('sha256')
      .update(
        typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : 'invalid',
      )
      .digest('hex'),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas nesta conta. Aguarde 15 minutos.' },
});
authRoutes.post('/login', accountLimiter, async (req, res) => res.json(await auth.login(req.body)));
authRoutes.post('/refresh', async (req, res) => {
  const { refreshToken } = z
    .object({ refreshToken: z.string().min(32).max(256) })
    .strict()
    .parse(req.body);
  res.json(await auth.refresh(refreshToken));
});
authRoutes.post('/logout', requireAuth, async (req, res) => {
  await auth.logout(req.auth.sessionId);
  res.sendStatus(204);
});
// Uniform response; no account lookup, token creation, or fake promise of email delivery.
authRoutes.post('/recovery', async (_req, res) =>
  res
    .status(202)
    .json({ message: 'Recuperação por e-mail ainda não disponível. Contate o administrador.' }),
);

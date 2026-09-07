import express from 'express';
import { apiRoutes } from './routes/api.js';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import pino from 'pino';
import { env, origins, logConfig } from './config/env.js';
import { authRoutes } from './controllers/auth.js';
import { AppError } from './services/errors.js';
import { releaseRoutes } from './routes/releases.js';
export const logger = pino(logConfig);
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) =>
        cb(
          origin && !origins.includes(origin) ? new AppError(403, 'Origem não permitida') : null,
          true,
        ),
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );
  app.use(express.json({ limit: '80kb' }));
  app.get('/health/live', (_req, res) =>
    res.json({ status: 'ok', commit: env.RENDER_GIT_COMMIT ?? 'local' }),
  );
  app.get('/health/ready', (_req, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ status: mongoose.connection.readyState === 1 ? 'ready' : 'unavailable' }),
  );
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Muitas requisições; aguarde um momento.' },
    }),
  );
  app.use('/api/auth', authRoutes);
  app.use('/api', apiRoutes);
  app.use('/downloads', releaseRoutes);
  return app;
}
export const errorHandler: express.ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: 'Dados inválidos',
      fields: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error?.code === 11000) {
    res.status(409).json({ error: 'Registro já existe' });
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Requisição muito grande' });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }
  logger.error({ code: 'REQUEST_FAILED', type: error?.name }, 'Falha na operação');
  res.status(500).json({ error: 'Não foi possível concluir a operação' });
};

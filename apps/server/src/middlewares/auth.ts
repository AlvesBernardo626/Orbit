import type { RequestHandler } from 'express';
import { authenticate } from '../services/auth.js';
import { AppError } from '../services/errors.js';
declare global {
  namespace Express {
    interface Request {
      auth: { userId: string; sessionId: string; exp: number };
    }
  }
}
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'Autenticação necessária');
    req.auth = await authenticate(header.slice(7));
    next();
  } catch {
    next(new AppError(401, 'Sessão inválida ou expirada'));
  }
};

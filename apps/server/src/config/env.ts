import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(48),
  CORS_ORIGINS: z.string().min(1),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  STUN_URLS: z.string().default(''),
  TURN_URLS: z.string().default(''),
  TURN_SECRET: z.string().default(''),
  ICE_RELAY_ONLY: z.enum(['true', 'false']).default('false'),
  REGISTRATION_ENABLED: z.enum(['true', 'false']).default('true'),
});
export const env = schema.parse(process.env);
if (env.JWT_SECRET.startsWith('replace-'))
  throw new Error('Gere JWT_SECRET aleatório antes de iniciar');
export const origins = env.CORS_ORIGINS.split(',')
  .map((v) => v.trim())
  .filter(Boolean);
if (
  env.NODE_ENV === 'production' &&
  (origins.some((o) => !o.startsWith('https://') && o !== 'orbit://app') ||
    env.JWT_SECRET.length < 48)
)
  throw new Error('Configuração de produção insegura');
if (env.TURN_URLS && env.TURN_SECRET.length < 32)
  throw new Error('TURN_SECRET deve ter pelo menos 32 caracteres');
if (env.ICE_RELAY_ONLY === 'true' && !env.TURN_URLS) throw new Error('Relay requer TURN');
export const logConfig = {
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: ['password', 'token', 'refreshToken', 'accessToken', 'req.headers.authorization'],
};

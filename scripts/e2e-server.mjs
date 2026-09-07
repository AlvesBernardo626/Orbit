import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
const uri = new URL(process.env.E2E_API_URL);
if (!['127.0.0.1', 'localhost'].includes(uri.hostname))
  throw new Error('E2E deve usar endereço local');
const repl = await MongoMemoryReplSet.create({
  binary: { version: '8.0.12' },
  replSet: { count: 1 },
});
const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: uri.port,
    MONGODB_URI: repl.getUri(),
    JWT_SECRET: randomBytes(64).toString('hex'),
    CORS_ORIGINS: process.env.E2E_DESKTOP_URL,
    REGISTRATION_ENABLED: 'true',
    STUN_URLS: '',
    TURN_URLS: '',
    TURN_SECRET: '',
    ICE_RELAY_ONLY: 'false',
  },
});
const stop = () => child.kill('SIGTERM');
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('exit', async (code) => {
  await repl.stop();
  process.exit(code ?? 0);
});

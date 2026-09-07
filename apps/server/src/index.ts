import { attachSockets } from './socket/index.js';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp, errorHandler, logger } from './app.js';
import { env } from './config/env.js';
import { createIndexes } from './models/index.js';
try {
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  });
  await createIndexes();
  const app = createApp();
  app.use(errorHandler);
  const server = createServer(app);
  const io = attachSockets(server);
  server.listen(env.PORT, '0.0.0.0', () => logger.info({ port: env.PORT }, 'Orbit API pronta'));
  const shutdown = () => {
    io.close(() => {
      void mongoose.disconnect().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  logger.fatal(
    { code: 'BOOT_FAILED', type: error instanceof Error ? error.name : 'UnknownError' },
    'Falha ao iniciar. Verifique configuração, conectividade e índices do MongoDB.',
  );
  await mongoose.disconnect();
  process.exit(1);
}

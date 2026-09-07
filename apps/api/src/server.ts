import Fastify from 'fastify';
import cors from '@fastify/cors';
import { connectDB } from './infra/database';
import dotenv from 'dotenv';

dotenv.config();

const server = Fastify({
  logger: true
});

server.register(cors, {
  origin: true // Allows all origins (including file:// used by Electron during dev)
});

server.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    await connectDB();
    const port = parseInt(process.env.PORT || '10000', 10);
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

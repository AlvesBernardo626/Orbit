import { MongoMemoryReplSet } from 'mongodb-memory-server';
import 'dotenv/config';
// Optional disposable local database. Docker/Atlas is the persistent development default.
const uri = new URL(process.env.MONGODB_URI);
const repl = await MongoMemoryReplSet.create({
  binary: { version: '8.0.12' },
  replSet: { count: 1, name: 'rs0' },
  instanceOpts: [{ port: Number(uri.port), ip: uri.hostname }],
  autoStart: true,
});
console.log('MongoDB temporário iniciado. Os dados serão apagados ao encerrar este processo.');
const stop = async () => {
  await repl.stop();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

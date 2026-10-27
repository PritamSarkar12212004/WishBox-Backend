/**
 * Temporary: a throwaway MongoDB for a local end-to-end check.
 * Deleted after the check.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const port = Number(process.env.TMP_MONGO_PORT ?? 27099);

const mongod = await MongoMemoryServer.create({
  instance: { port, dbName: 'wishbox-e2e' },
});

console.log(`TMP_MONGO_READY ${mongod.getUri()}`);

const stop = async () => {
  await mongod.stop().catch(() => undefined);
  process.exit(0);
};

process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());

setInterval(() => undefined, 1 << 30);

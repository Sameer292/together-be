import { createDatabase } from '@infra/database/database.client';
import { Elysia } from 'elysia';
import { createApp } from '@/app/app';
import { loadConfig } from '@/app/config/env';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = new Elysia().use(createApp(config, database.db)).listen({
  port: config.port,
  idleTimeout: 30,
  maxRequestBodySize: Math.max(config.maxImageBytes, 1_048_576),
});
console.info(JSON.stringify({ event: 'server_started', port: config.port }));
let stopping = false;
const stop = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  await app.stop();
  await database.close();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

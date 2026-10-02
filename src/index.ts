import { createApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = createApp(config, database.db).listen({
  port: config.port,
  idleTimeout: 30,
  maxRequestBodySize: Math.max(config.maxImageBytes, 1_048_576),
});
console.info(JSON.stringify({ event: 'server_started', port: config.port }));
let stopping = false;
const stop = (): void => {
  if (stopping) return;
  stopping = true;
  if (app.server) app.stop();
  void database.close();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

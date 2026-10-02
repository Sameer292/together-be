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
process.on('SIGTERM', () => {
  app.stop();
  void database.close();
});
process.on('SIGINT', () => {
  app.stop();
  void database.close();
});

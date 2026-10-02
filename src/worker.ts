import { loadConfig } from './config';
import { createDatabase } from './db';
import { createJobService } from './jobs/service';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const jobs = createJobService(database.db, config);
let running = true;
process.on('SIGTERM', () => {
  running = false;
});
process.on('SIGINT', () => {
  running = false;
});
await jobs.ensureCleanup();
while (running) {
  const worked = await jobs.runOne();
  if (!worked) await Bun.sleep(1000);
}
await database.close();

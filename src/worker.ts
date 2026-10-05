import { createDatabase } from '@infra/database/database.client';
import { loadConfig } from '@/app/config/env';
import { createJobService } from '@/jobs/job.service';

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

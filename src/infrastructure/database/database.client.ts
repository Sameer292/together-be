import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './database.schema';

export const createDatabase = (url: string) => {
  const parsed = new URL(url);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') throw new Error('Invalid PostgreSQL URL');
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  const client = postgres(url, { max: 10, prepare: false, ssl: local ? false : 'require' });
  return {
    db: drizzle(client, { schema }),
    client,
    close: async (): Promise<void> => {
      await client.end();
    },
  };
};
export type Database = ReturnType<typeof createDatabase>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

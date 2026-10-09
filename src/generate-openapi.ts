import { createApp } from './app';
import type { Config } from './config';
import { createDatabase } from './db';

const config: Config = {
  providerMode: 'supabase',
  localMediaDir: '.local/media',
  databaseUrl: 'postgres://unused:unused@127.0.0.1:5432/unused',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'unused',
  supabaseServiceKey: 'unused',
  storageBucket: 'private',
  authCallbackUrl: 'http://localhost:3000/v1/auth/callback',
  freeGroupCapacity: 2,
  paidGroupCapacity: 4,
  freeActiveChallenges: 1,
  paidActiveChallenges: 2,
  maxImageBytes: 1048576,
  maxAttachmentsPerSubmission: 3,
  billingMode: 'test',
  revenueCatEnvironment: 'sandbox',
  port: 3000,
};
const database = createDatabase(config.databaseUrl);
const response = await createApp(config, database.db).handle(new Request('http://localhost/v1/openapi/json'));
if (!response.ok) throw new Error(`OpenAPI generation failed: ${response.status}`);
const document: unknown = await response.json();
await Bun.write('docs/openapi.json', `${JSON.stringify(document, null, 2)}\n`);
await database.close();

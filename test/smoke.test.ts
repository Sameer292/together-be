import { expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createApp } from '../src/app';
import { verifyRevenueCatSignature } from '../src/billing/service';
import type { Config } from '../src/config';
import { createDatabase } from '../src/db';

const config: Config = {
  providerMode: 'supabase',
  localMediaDir: '.local/media',
  databaseUrl: 'postgres://unused:unused@127.0.0.1:5432/unused',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'test',
  supabaseServiceKey: 'test',
  storageBucket: 'private',
  authCallbackUrl: 'http://localhost:3000/v1/auth/callback',
  freeGroupCapacity: 2,
  paidGroupCapacity: 3,
  freeActiveChallenges: 1,
  paidActiveChallenges: 2,
  maxImageBytes: 1048576,
  maxAttachmentsPerSubmission: 3,
  billingMode: 'test',
  revenueCatEnvironment: 'sandbox',
  port: 3000,
};
const database = createDatabase(config.databaseUrl);
const app = createApp(config, database.db);

test('liveness, anonymous denial, and generated API specification', async () => {
  const live = await app.handle(new Request('http://localhost/v1/live'));
  expect(live.status).toBe(200);
  expect(await live.json()).toEqual({ data: { status: 'live' } });
  const denied = await app.handle(new Request('http://localhost/v1/groups'));
  expect(denied.status).toBe(401);
  const spec = await app.handle(new Request('http://localhost/v1/openapi/json'));
  expect(spec.status).toBe(200);
  const document = await spec.json();
  expect(document.paths['/v1/challenges/{challengeId}/feed']).toBeDefined();
});

test('webhook signature requires valid HMAC and fresh timestamp', () => {
  const timestamp = 1_700_000_000;
  const raw = '{"event":{"id":"fixture"}}';
  const digest = createHmac('sha256', 'secret').update(`${timestamp}.${raw}`).digest('hex');
  expect(verifyRevenueCatSignature(raw, `t=${timestamp},v1=${digest}`, 'secret', timestamp)).toBe(true);
  expect(verifyRevenueCatSignature(`${raw} `, `t=${timestamp},v1=${digest}`, 'secret', timestamp)).toBe(false);
  expect(verifyRevenueCatSignature(raw, `t=${timestamp},v1=${digest}`, 'secret', timestamp + 301)).toBe(false);
});

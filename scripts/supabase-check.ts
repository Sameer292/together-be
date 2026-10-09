import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { createDatabase } from '../src/db';
import { profiles } from '../src/db/schema';

const config = loadConfig();
if (config.providerMode !== 'supabase') throw new Error('Supabase mode required');
const databaseUrl = new URL(config.databaseUrl);
if (
  process.env.NODE_ENV !== 'development' ||
  !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
  !databaseUrl.pathname.endsWith('_dev')
)
  throw new Error('This check requires a local development database');
const database = createDatabase(config.databaseUrl);
const headers = {
  apikey: config.supabaseServiceKey,
  'Content-Type': 'application/json',
  ...(config.supabaseServiceKey.startsWith('sb_secret_')
    ? {}
    : { Authorization: `Bearer ${config.supabaseServiceKey}` }),
};
const email = `together-smoke-${crypto.randomUUID()}@example.test`;
const password = `${randomBytes(24).toString('base64url')}Aa1!`;
let userId: string | undefined;
let objectKey: string | undefined;
try {
  const bucket = await fetch(`${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.storageBucket)}`, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  const bucketBody: unknown = await bucket.json().catch(() => null);
  const privateBucket =
    bucket.ok && bucketBody && typeof bucketBody === 'object' && 'public' in bucketBody && bucketBody.public === false;
  console.log(JSON.stringify({ check: 'private_bucket', status: bucket.status, private: privateBucket }));
  if (!privateBucket) throw new Error('Private bucket unavailable');
  objectKey = `integration-check/${crypto.randomUUID()}.webp`;
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } })
    .webp()
    .toBuffer();
  const upload = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.storageBucket}/${objectKey}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'false' },
    body: image,
    signal: AbortSignal.timeout(30000),
  });
  console.log(JSON.stringify({ check: 'private_upload', status: upload.status }));
  if (!upload.ok) throw new Error('Private upload failed');
  const stored = await fetch(
    `${config.supabaseUrl}/storage/v1/object/authenticated/${config.storageBucket}/${objectKey}`,
    {
      headers,
      signal: AbortSignal.timeout(30000),
    },
  );
  const storedBytes = stored.ok ? (await stored.arrayBuffer()).byteLength : 0;
  console.log(JSON.stringify({ check: 'private_read', status: stored.status, bytes: storedBytes }));
  if (!stored.ok || !storedBytes) throw new Error('Private read failed');
  const anonymous = await fetch(`${config.supabaseUrl}/storage/v1/object/public/${config.storageBucket}/${objectKey}`, {
    signal: AbortSignal.timeout(30000),
  });
  console.log(JSON.stringify({ check: 'anonymous_read_denied', status: anonymous.status }));
  if (anonymous.ok) throw new Error('Private object was public');
  const created = await fetch(`${config.supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
    signal: AbortSignal.timeout(30000),
  });
  const body: unknown = await created.json().catch(() => null);
  if (body && typeof body === 'object') {
    const possible =
      'id' in body
        ? body.id
        : 'user' in body && body.user && typeof body.user === 'object' && 'id' in body.user
          ? body.user.id
          : undefined;
    if (typeof possible === 'string') userId = possible;
  }
  console.log(JSON.stringify({ check: 'create_synthetic_user', status: created.status, hasId: !!userId }));
  if (!created.ok || !userId) throw new Error('Cannot create test user');
  const app = createApp(config, database.db);
  const login = await app.handle(
    new Request('http://localhost/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  );
  const loginBody: unknown = await login.json().catch(() => null);
  const token =
    loginBody &&
    typeof loginBody === 'object' &&
    'data' in loginBody &&
    loginBody.data &&
    typeof loginBody.data === 'object' &&
    'accessToken' in loginBody.data &&
    typeof loginBody.data.accessToken === 'string'
      ? loginBody.data.accessToken
      : undefined;
  console.log(JSON.stringify({ check: 'backend_login', status: login.status, hasToken: !!token }));
  if (!login.ok || !token) throw new Error('Backend login failed');
  const me = await app.handle(new Request('http://localhost/v1/me', { headers: { Authorization: `Bearer ${token}` } }));
  const [profile] = await database.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId));
  console.log(
    JSON.stringify({ check: 'verified_auth_local_profile', status: me.status, profileMatches: profile?.id === userId }),
  );
  if (!me.ok || profile?.id !== userId) throw new Error('Profile mapping failed');
} finally {
  if (objectKey) {
    const deleted = await fetch(`${config.supabaseUrl}/storage/v1/object/${config.storageBucket}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ prefixes: [objectKey] }),
      signal: AbortSignal.timeout(30000),
    }).catch(() => null);
    console.log(JSON.stringify({ check: 'delete_test_object', status: deleted?.status ?? 0 }));
    if (!deleted?.ok) process.exitCode = 1;
  }
  if (userId) {
    let deletionStatus = 0;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const deleted = await fetch(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(30000),
      }).catch(() => null);
      deletionStatus = deleted?.status ?? 0;
      if (deleted?.ok || deleted?.status === 404) break;
    }
    console.log(JSON.stringify({ check: 'delete_synthetic_user', status: deletionStatus }));
    if (deletionStatus !== 200 && deletionStatus !== 204 && deletionStatus !== 404) {
      console.error(JSON.stringify({ cleanupUserId: userId }));
      process.exitCode = 1;
    }
    const removed = await database.db.delete(profiles).where(eq(profiles.id, userId)).returning({ id: profiles.id });
    console.log(JSON.stringify({ check: 'delete_local_profile', removed: removed.length }));
  }
  await database.close();
}

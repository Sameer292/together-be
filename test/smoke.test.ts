import { expect, test } from 'bun:test';
import { createHmac } from 'node:crypto';
import { createDatabase } from '@infra/database/database.client';
import type { Actor } from '@modules/auth/auth.service';
import { createAuthService } from '@modules/auth/auth.service';
import { verifyRevenueCatSignature } from '@modules/billing/billing.service';
import { createGroupService } from '@modules/groups/group.service';
import { createMemberGroupRoutes } from '@modules/groups/member/member-group.routes';
import { fail } from '@shared/errors/app-error';
import { Elysia } from 'elysia';
import { createApp } from '@/app/app';
import type { Config } from '@/app/config/env';
import { createAuthGuard } from '@/app/middleware/auth-guard';
import { createRateLimit } from '@/app/middleware/rate-limit';
import { createRequestLifecycle } from '@/app/middleware/request-lifecycle';

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
  expect(app.routes.filter(({ path }) => !path.startsWith('/v1/openapi'))).toHaveLength(57);
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

const uuid = '12345678-1234-4234-8234-123456789abc';
const challenge = {
  title: 'Fixture',
  description: '',
  criteria: 'Describe your work',
  proofFormats: ['text'],
  deadlineAt: '2099-01-01T00:00:00.000Z',
};
type ProtectedRequest = { method: string; path: string; body?: Record<string, unknown> };
const protectedRequests: ProtectedRequest[] = [
  { method: 'POST', path: '/auth/logout' },
  { method: 'GET', path: '/me' },
  { method: 'PATCH', path: '/me', body: { displayName: 'Fixture' } },
  { method: 'POST', path: '/me/deletion-request', body: { password: 'fixture' } },
  { method: 'POST', path: '/groups', body: { name: 'Fixture' } },
  { method: 'GET', path: '/groups' },
  { method: 'GET', path: `/groups/${uuid}` },
  { method: 'PATCH', path: `/groups/${uuid}`, body: { name: 'Fixture', description: '' } },
  { method: 'POST', path: `/groups/${uuid}/archive` },
  { method: 'POST', path: `/groups/${uuid}/leave` },
  { method: 'POST', path: `/groups/${uuid}/transfer`, body: { newOwnerId: uuid } },
  { method: 'DELETE', path: `/groups/${uuid}/members/${uuid}` },
  { method: 'POST', path: `/groups/${uuid}/invitations`, body: { expiresInHours: 1 } },
  { method: 'DELETE', path: `/groups/${uuid}/invitations/${uuid}` },
  { method: 'POST', path: '/invitations/accept', body: { token: 'a'.repeat(32) } },
  { method: 'POST', path: `/groups/${uuid}/challenges`, body: challenge },
  { method: 'GET', path: `/groups/${uuid}/challenges` },
  { method: 'GET', path: `/challenges/${uuid}` },
  { method: 'PATCH', path: `/challenges/${uuid}`, body: challenge },
  { method: 'POST', path: `/challenges/${uuid}/publish` },
  { method: 'POST', path: `/challenges/${uuid}/cancel` },
  { method: 'POST', path: `/challenges/${uuid}/submissions`, body: { text: 'Fixture', attachmentIds: [] } },
  { method: 'GET', path: `/challenges/${uuid}/submissions/me` },
  { method: 'DELETE', path: `/challenges/${uuid}/submissions/me` },
  { method: 'GET', path: `/challenges/${uuid}/feed` },
  { method: 'POST', path: `/challenges/${uuid}/uploads` },
  { method: 'GET', path: `/attachments/${uuid}` },
  { method: 'DELETE', path: `/attachments/${uuid}` },
  { method: 'POST', path: `/submissions/${uuid}/comments`, body: { body: 'Fixture' } },
  { method: 'GET', path: `/submissions/${uuid}/comments` },
  { method: 'DELETE', path: `/comments/${uuid}` },
  { method: 'POST', path: `/submissions/${uuid}/reactions`, body: { emoji: 'like' } },
  { method: 'GET', path: `/submissions/${uuid}/reactions` },
  { method: 'DELETE', path: `/submissions/${uuid}/reactions/like` },
  { method: 'POST', path: '/blocks', body: { userId: uuid } },
  { method: 'DELETE', path: `/blocks/${uuid}` },
  { method: 'POST', path: `/reports/users/${uuid}`, body: { reason: 'Fixture' } },
  { method: 'POST', path: `/reports/submissions/${uuid}`, body: { reason: 'Fixture' } },
  { method: 'GET', path: `/groups/${uuid}/entitlement` },
  { method: 'POST', path: `/groups/${uuid}/upgrade-intents` },
  { method: 'POST', path: `/upgrade-intents/${uuid}/reconcile`, body: { subscriptionId: 'fixture' } },
  { method: 'GET', path: '/moderation/reports' },
  { method: 'POST', path: `/moderation/reports/${uuid}/review`, body: { state: 'dismissed' } },
  { method: 'GET', path: `/moderation/submissions/${uuid}` },
  { method: 'GET', path: `/moderation/attachments/${uuid}` },
];

test.each(protectedRequests)('route plugin denies anonymous $method $path', async ({ method, path, body }) => {
  const response = await app.handle(
    new Request(`http://localhost/v1${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get('x-request-id')).toBeTruthy();
  expect(await response.json()).toMatchObject({ error: { code: 'unauthorized', message: 'Bearer token required' } });
});

test('global lifecycle covers nested plugins without making public routes private', async () => {
  const nested = new Elysia().use(createApp(config, database.db));
  const callback = await nested.handle(new Request('http://localhost/v1/auth/callback'));
  expect(callback.status).toBe(200);
  expect(callback.headers.get('x-request-id')).toBeTruthy();
  const invalid = await nested.handle(
    new Request('http://localhost/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'invalid' }),
    }),
  );
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toMatchObject({ error: { code: 'bad_request', message: 'Invalid request' } });
  const oversized = await nested.handle(
    new Request('http://localhost/v1/auth/register', {
      method: 'POST',
      headers: { 'content-length': '64001' },
    }),
  );
  expect(oversized.status).toBe(413);
  expect(oversized.headers.get('x-request-id')).toBeTruthy();
  const missing = await nested.handle(new Request('http://localhost/v1/missing'));
  expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({ error: { code: 'not_found', message: 'Not found' } });
});

test('standalone feature routes resolve the actor once and leave siblings public', async () => {
  let verifications = 0;
  const actor: Actor = { id: uuid, email: 'fixture@example.test', verified: true, moderationRole: false };
  const auth = {
    ...createAuthService(config, database.db),
    userFromToken: async (token: string): Promise<Actor> => {
      verifications += 1;
      if (token !== 'fixture') return fail(401, 'unauthorized', 'Invalid token');
      return actor;
    },
  };
  const groups = {
    ...createGroupService(database.db, config),
    get: async (current: Actor, id: string) => {
      expect(current).toEqual(actor);
      return { id, name: 'Fixture', description: '', ownerId: current.id, archivedAt: null };
    },
  };
  const feature = new Elysia()
    .use(createRequestLifecycle(config))
    .use(createMemberGroupRoutes(groups, createAuthGuard(auth), createRateLimit()))
    .get('/public', () => 'public');
  const response = await feature.handle(
    new Request(`http://localhost/groups/${uuid}`, {
      headers: { authorization: 'Bearer fixture' },
    }),
  );
  expect(response.status).toBe(200);
  expect(verifications).toBe(1);
  expect(await response.json()).toMatchObject({ data: { id: uuid, ownerId: actor.id } });
  expect((await feature.handle(new Request('http://localhost/public'))).status).toBe(200);
  expect(verifications).toBe(1);
  expect(
    (
      await feature.handle(
        new Request(`http://localhost/groups/${uuid}`, {
          headers: { authorization: 'Bearer invalid' },
        }),
      )
    ).status,
  ).toBe(401);
});

test('rate limiting is shared per application, separated by operation and client', () => {
  const limit = createRateLimit();
  const request = new Request('http://localhost');
  const server = { requestIP: (_request: Request): { address: string } => ({ address: '127.0.0.1' }) };
  for (let attempt = 0; attempt < 10; attempt += 1) limit(request, server, 'login');
  expect(() => limit(request, server, 'login')).toThrow('Too many requests');
  expect(() => limit(request, server, 'register')).not.toThrow();
  expect(() => limit(request, { requestIP: () => ({ address: '127.0.0.2' }) }, 'login')).not.toThrow();
  expect(() => createRateLimit()(request, server, 'login')).not.toThrow();
});

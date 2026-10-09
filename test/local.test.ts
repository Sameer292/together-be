import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { createDatabase } from '@infra/database/database.client';
import { jobs, localAuthAccounts } from '@infra/database/database.schema';
import { createAuthService } from '@modules/auth/auth.service';
import { isRecord } from '@shared/utils/validation';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import sharp from 'sharp';
import { createApp } from '@/app/app';
import type { Config } from '@/app/config/env';
import { createJobService } from '@/jobs/job.service';

const url = process.env.TEST_DATABASE_URL;
const integration =
  url && /^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):\d+\/[^?]*_test(?:\?|$)/.test(url) ? test : test.skip;

const responseField = async (response: Response, field: string): Promise<string> => {
  const body: unknown = await response.json();
  if (!isRecord(body) || !isRecord(body.data)) throw new Error('Expected data response');
  const value = body.data[field];
  if (typeof value !== 'string') throw new Error(`Expected string field: ${field}`);
  return value;
};

integration(
  'local PostgreSQL auth and private disk proof work without Supabase',
  async () => {
    const mediaDir = `.local/test-${crypto.randomUUID()}`;
    const config: Config = {
      providerMode: 'local',
      localMediaDir: mediaDir,
      databaseUrl: url ?? '',
      supabaseUrl: '',
      supabaseAnonKey: '',
      supabaseServiceKey: '',
      storageBucket: 'unused',
      authCallbackUrl: 'http://localhost:3000/v1/auth/callback',
      freeGroupCapacity: 3,
      paidGroupCapacity: 5,
      freeActiveChallenges: 2,
      paidActiveChallenges: 3,
      maxImageBytes: 1048576,
      maxAttachmentsPerSubmission: 3,
      billingMode: 'test',
      revenueCatEnvironment: 'sandbox',
      port: 3000,
    };
    const database = createDatabase(config.databaseUrl);
    await migrate(database.db, { migrationsFolder: './drizzle' });
    const app = createApp(config, database.db);
    const auth = createAuthService(config, database.db);
    const email = `${crypto.randomUUID()}@example.test`;
    const password = 'local-test-password-123';
    const post = async (path: string, body: object): Promise<Response> =>
      app.handle(
        new Request(`http://localhost${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    try {
      const registered = await post('/v1/auth/register', { email, password });
      expect(registered.status).toBe(200);
      const code = await responseField(registered, 'devCode');
      expect(code).toMatch(/^\d{6}$/);
      const denied = await post('/v1/auth/login', { email, password });
      expect(denied.status).toBe(401);
      expect((await post('/v1/auth/verify', { email, code: '000000' })).status).toBe(401);
      const verified = await post('/v1/auth/verify', { email, code });
      expect(verified.status).toBe(200);
      const accessToken = await responseField(verified, 'accessToken');
      const authorized = async (path: string, method: string = 'GET', body?: object): Promise<Response> =>
        app.handle(
          new Request(`http://localhost${path}`, {
            method,
            headers: {
              authorization: `Bearer ${accessToken}`,
              'content-type': 'application/json',
              'idempotency-key': crypto.randomUUID(),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
          }),
        );
      const me = await authorized('/v1/me');
      expect(me.status).toBe(200);
      const actor = await auth.userFromToken(accessToken);
      expect((await authorized('/v1/moderation/reports')).status).toBe(403);
      const group = await authorized('/v1/groups', 'POST', { name: 'Local fixture' });
      expect(group.status).toBe(200);
      const groupId = await responseField(group, 'id');
      const challenge = await authorized(`/v1/groups/${groupId}/challenges`, 'POST', {
        title: 'Attach an image',
        description: '',
        criteria: 'One image',
        proofFormats: ['image'],
        deadlineAt: new Date(Date.now() + 60000).toISOString(),
      });
      expect(challenge.status).toBe(200);
      const challengeId = await responseField(challenge, 'id');
      expect((await authorized(`/v1/challenges/${challengeId}/publish`, 'POST')).status).toBe(200);
      const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } })
        .png()
        .toBuffer();
      const upload = await app.handle(
        new Request(`http://localhost/v1/challenges/${challengeId}/uploads`, {
          method: 'POST',
          headers: { 'content-length': String(png.byteLength), authorization: `Bearer ${accessToken}` },
          body: png,
        }),
      );
      expect(upload.status).toBe(200);
      const attachmentId = await responseField(upload, 'id');
      expect((await authorized(`/v1/attachments/${attachmentId}`)).status).toBe(404);
      expect((await authorized(`/v1/challenges/${challengeId}/feed`)).status).toBe(403);
      expect(
        (
          await authorized(`/v1/challenges/${challengeId}/submissions`, 'POST', {
            attachmentIds: [attachmentId],
          })
        ).status,
      ).toBe(200);
      expect((await authorized(`/v1/challenges/${challengeId}/feed`)).status).toBe(200);
      const object = await authorized(`/v1/attachments/${attachmentId}`);
      expect(object.status).toBe(200);
      expect(object.headers.get('cache-control')).toBe('private, no-store');
      expect((await object.arrayBuffer()).byteLength).toBeGreaterThan(0);
      const resetRequest = await post('/v1/auth/password-reset/request', { email });
      const resetCode = await responseField(resetRequest, 'devCode');
      expect(
        (await post('/v1/auth/password-reset/confirm', { email, code: '000000', password: 'new-local-password-123' }))
          .status,
      ).toBe(401);
      expect(
        (
          await post('/v1/auth/password-reset/confirm', {
            email,
            code: resetCode,
            password: 'new-local-password-123',
          })
        ).status,
      ).toBe(200);
      await expect(auth.userFromToken(accessToken)).rejects.toMatchObject({ status: 401 });
      const newLogin = await post('/v1/auth/login', { email, password: 'new-local-password-123' });
      expect(newLogin.status).toBe(200);
      const newAccessToken = await responseField(newLogin, 'accessToken');
      const deletion = await app.handle(
        new Request('http://localhost/v1/me/deletion-request', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${newAccessToken}` },
          body: JSON.stringify({ password: 'new-local-password-123' }),
        }),
      );
      expect(deletion.status).toBe(200);
      await database.db
        .update(jobs)
        .set({ runAt: new Date(0) })
        .where(eq(jobs.kind, 'delete_account'));
      await createJobService(database.db, config).runOne();
      const [remaining] = await database.db
        .select({ id: localAuthAccounts.id })
        .from(localAuthAccounts)
        .where(eq(localAuthAccounts.id, actor.id));
      expect(remaining).toBeUndefined();
      await expect(auth.userFromToken(newAccessToken)).rejects.toMatchObject({ status: 401 });
    } finally {
      await database.close();
      await rm(mediaDir, { recursive: true, force: true });
    }
  },
  30000,
);

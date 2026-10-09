import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import sharp from 'sharp';
import { createApp } from '../src/app';
import { createAuthService } from '../src/auth/service';
import { createChallengeService } from '../src/challenges/service';
import type { Config } from '../src/config';
import { createDatabase } from '../src/db';
import { jobs, localAuthAccounts } from '../src/db/schema';
import { createGroupService } from '../src/groups/service';
import { createJobService } from '../src/jobs/service';
import { createMediaService } from '../src/media/service';
import { createSubmissionService } from '../src/submissions/service';

const url = process.env.TEST_DATABASE_URL;
const integration =
  url && /^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):\d+\/[^?]*_test(?:\?|$)/.test(url) ? test : test.skip;

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
      const registration = await registered.json();
      const code: string = registration.data.devCode;
      expect(code).toMatch(/^\d{6}$/);
      const denied = await post('/v1/auth/login', { email, password });
      expect(denied.status).toBe(401);
      expect((await post('/v1/auth/verify', { email, code: '000000' })).status).toBe(401);
      const verified = await post('/v1/auth/verify', { email, code });
      expect(verified.status).toBe(200);
      const tokens = (await verified.json()).data;
      const me = await app.handle(
        new Request('http://localhost/v1/me', {
          headers: { authorization: `Bearer ${tokens.accessToken}` },
        }),
      );
      expect(me.status).toBe(200);
      const actor = await auth.userFromToken(tokens.accessToken);
      const groups = createGroupService(database.db, config);
      const challenges = createChallengeService(database.db, config);
      const submissions = createSubmissionService(database.db, config);
      const media = createMediaService(database.db, config);
      const group = await groups.create(actor, 'Local fixture', '', crypto.randomUUID());
      const challenge = await challenges.create(
        actor,
        group.id,
        {
          title: 'Attach an image',
          description: '',
          criteria: 'One image',
          proofFormats: ['image'],
          deadlineAt: new Date(Date.now() + 60000).toISOString(),
        },
        crypto.randomUUID(),
      );
      await challenges.publish(actor, challenge.id);
      const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } })
        .png()
        .toBuffer();
      const upload = await media.upload(
        actor,
        challenge.id,
        new Request('http://localhost/upload', {
          method: 'POST',
          headers: { 'content-length': String(png.byteLength) },
          body: png,
        }),
      );
      await expect(media.read(actor, upload.id)).rejects.toMatchObject({ status: 404 });
      await submissions.submit(actor, challenge.id, { attachmentIds: [upload.id] }, crypto.randomUUID());
      const object = await media.read(actor, upload.id);
      expect(object.status).toBe(200);
      expect(object.headers.get('cache-control')).toBe('private, no-store');
      expect((await object.arrayBuffer()).byteLength).toBeGreaterThan(0);
      const resetRequest = await post('/v1/auth/password-reset/request', { email });
      const reset = (await resetRequest.json()).data;
      expect(
        (await post('/v1/auth/password-reset/confirm', { email, code: '000000', password: 'new-local-password-123' }))
          .status,
      ).toBe(401);
      expect(
        (
          await post('/v1/auth/password-reset/confirm', {
            email,
            code: reset.devCode,
            password: 'new-local-password-123',
          })
        ).status,
      ).toBe(200);
      await expect(auth.userFromToken(tokens.accessToken)).rejects.toMatchObject({ status: 401 });
      const newLogin = await post('/v1/auth/login', { email, password: 'new-local-password-123' });
      expect(newLogin.status).toBe(200);
      const newTokens = (await newLogin.json()).data;
      const deletion = await app.handle(
        new Request('http://localhost/v1/me/deletion-request', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${newTokens.accessToken}` },
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
      await expect(auth.userFromToken(newTokens.accessToken)).rejects.toMatchObject({ status: 401 });
    } finally {
      await database.close();
      await rm(mediaDir, { recursive: true, force: true });
    }
  },
  30000,
);

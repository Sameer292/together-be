import { expect, test } from 'bun:test';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Actor } from '../src/auth/service';
import { createBillingService } from '../src/billing/service';
import { createChallengeService } from '../src/challenges/service';
import type { Config } from '../src/config';
import { createDatabase } from '../src/db';
import {
  attachments,
  challenges as challengeRows,
  groups as groupRows,
  jobs,
  memberships,
  participants,
  profiles,
  subscriptions,
} from '../src/db/schema';
import { createEngagementService } from '../src/engagement/service';
import { createGroupService } from '../src/groups/service';
import { createJobService } from '../src/jobs/service';
import { createSubmissionService } from '../src/submissions/service';

const url = process.env.TEST_DATABASE_URL;
const isolated = Boolean(
  url && /^postgres(?:ql)?:\/\/[^/]+@(?:127\.0\.0\.1|localhost):\d+\/[^?]*_test(?:\?|$)/.test(url),
);
const integration = isolated ? test : test.skip;
const config = (capacity: number): Config => ({
  providerMode: 'supabase',
  localMediaDir: '.local/media',
  databaseUrl: url ?? 'postgres://unused:unused@localhost:5432/unused_test',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'test',
  supabaseServiceKey: 'test',
  storageBucket: 'private',
  authCallbackUrl: 'http://localhost:3000/v1/auth/callback',
  freeGroupCapacity: capacity,
  paidGroupCapacity: capacity + 2,
  freeActiveChallenges: 3,
  paidActiveChallenges: 5,
  maxImageBytes: 1048576,
  maxAttachmentsPerSubmission: 3,
  billingMode: 'test',
  revenueCatEnvironment: 'sandbox',
  port: 3000,
});
const actor = (): Actor => ({
  id: crypto.randomUUID(),
  email: `${crypto.randomUUID()}@example.test`,
  verified: true,
  moderationRole: false,
});

integration('capacity, snapshot, reveal, deletion, rejoin, and idempotency use PostgreSQL transactions', async () => {
  const database = createDatabase(config(3).databaseUrl);
  await migrate(database.db, { migrationsFolder: './drizzle' });
  const owner = actor();
  const member = actor();
  const late = actor();
  const outsider = actor();
  for (const person of [owner, member, late, outsider])
    await database.db.insert(profiles).values({ id: person.id, displayName: 'Fixture' });
  const groups = createGroupService(database.db, config(3));
  const challenges = createChallengeService(database.db, config(3));
  const submissions = createSubmissionService(database.db, config(3));
  const engagement = createEngagementService(database.db);
  try {
    const group = await groups.create(owner, 'Fixture group', '', crypto.randomUUID());
    await groups.create(outsider, 'Other group', '', crypto.randomUUID());
    await expect(groups.get(outsider, group.id)).rejects.toMatchObject({ status: 403 });
    const invite = await groups.invite(owner, group.id, 1);
    await groups.acceptInvite(member, invite.token);
    const input = {
      title: 'Build a thing',
      description: 'Any project',
      criteria: 'Describe it',
      proofFormats: ['text'],
      deadlineAt: new Date(Date.now() + 60000).toISOString(),
    };
    const created = await challenges.create(owner, group.id, input, crypto.randomUUID());
    await challenges.publish(owner, created.id);
    await expect(challenges.get(outsider, created.id)).rejects.toMatchObject({ status: 403 });
    await expect(
      submissions.submit(outsider, created.id, { text: 'Wrong group', attachmentIds: [] }, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await groups.acceptInvite(late, invite.token);
    await expect(challenges.get(late, created.id)).rejects.toMatchObject({ status: 403 });
    await expect(submissions.feed(member, created.id, 20)).rejects.toMatchObject({ status: 403 });
    const proof = { text: 'Owner proof', attachmentIds: [] };
    const key = crypto.randomUUID();
    const first = await submissions.submit(owner, created.id, proof, key);
    await expect(engagement.listComments(member, first.id, 20)).rejects.toMatchObject({ status: 403 });
    await expect(engagement.listReactions(member, first.id)).rejects.toMatchObject({ status: 403 });
    await expect(engagement.addComment(member, first.id, 'Too early')).rejects.toMatchObject({ status: 403 });
    await expect(engagement.addReaction(member, first.id, 'like')).rejects.toMatchObject({ status: 403 });
    expect(await submissions.submit(owner, created.id, proof, key)).toEqual(first);
    await expect(
      submissions.submit(owner, created.id, { text: 'Changed', attachmentIds: [] }, key),
    ).rejects.toMatchObject({ status: 409 });
    await expect(submissions.feed(member, created.id, 20)).rejects.toMatchObject({ status: 403 });
    await submissions.submit(member, created.id, { text: 'Member proof', attachmentIds: [] }, crypto.randomUUID());
    expect((await submissions.feed(member, created.id, 20)).items.some((item) => item.text === 'Owner proof')).toBe(
      true,
    );
    await submissions.deleteOwn(member, created.id);
    await expect(submissions.feed(member, created.id, 20)).rejects.toMatchObject({ status: 403 });
    await groups.leave(member, group.id);
    await groups.acceptInvite(member, invite.token);
    await expect(submissions.own(member, created.id)).rejects.toMatchObject({ status: 403 });
  } finally {
    await database.close();
  }
});

integration('parallel invite acceptance cannot exceed capacity', async () => {
  const database = createDatabase(config(2).databaseUrl);
  await migrate(database.db, { migrationsFolder: './drizzle' });
  const owner = actor();
  const one = actor();
  const two = actor();
  for (const person of [owner, one, two])
    await database.db.insert(profiles).values({ id: person.id, displayName: 'Fixture' });
  const groups = createGroupService(database.db, config(2));
  try {
    const group = await groups.create(owner, 'Capacity fixture', '', crypto.randomUUID());
    const invite = await groups.invite(owner, group.id, 1);
    const outcomes = await Promise.allSettled([
      groups.acceptInvite(one, invite.token),
      groups.acceptInvite(two, invite.token),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const [count] = await database.db
      .select({ value: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.groupId, group.id), eq(memberships.active, true)));
    expect(count?.value).toBe(2);
  } finally {
    await database.close();
  }
});

integration('publication and joining produce one consistent participant snapshot', async () => {
  const database = createDatabase(config(3).databaseUrl);
  await migrate(database.db, { migrationsFolder: './drizzle' });
  const owner = actor();
  const joiner = actor();
  for (const person of [owner, joiner])
    await database.db.insert(profiles).values({ id: person.id, displayName: 'Fixture' });
  const groups = createGroupService(database.db, config(3));
  const challenges = createChallengeService(database.db, config(3));
  try {
    const group = await groups.create(owner, 'Snapshot fixture', '', crypto.randomUUID());
    const invite = await groups.invite(owner, group.id, 1);
    const challenge = await challenges.create(
      owner,
      group.id,
      {
        title: 'Concurrent snapshot',
        description: '',
        criteria: 'Describe it',
        proofFormats: ['text'],
        deadlineAt: new Date(Date.now() + 60000).toISOString(),
      },
      crypto.randomUUID(),
    );
    await Promise.all([challenges.publish(owner, challenge.id), groups.acceptInvite(joiner, invite.token)]);
    const [snapshot] = await database.db
      .select({ membershipId: participants.membershipId })
      .from(participants)
      .where(and(eq(participants.challengeId, challenge.id), eq(participants.userId, joiner.id)));
    if (snapshot) {
      const [active] = await database.db
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.groupId, group.id), eq(memberships.userId, joiner.id)));
      if (!active) throw new Error('Joined membership missing');
      expect(snapshot.membershipId).toBe(active.id);
      expect((await challenges.get(joiner, challenge.id)).eligible).toBe(true);
    } else await expect(challenges.get(joiner, challenge.id)).rejects.toMatchObject({ status: 403 });
  } finally {
    await database.close();
  }
});

integration('test billing binds only the intended group and jobs persist attempts', async () => {
  const database = createDatabase(config(2).databaseUrl);
  await migrate(database.db, { migrationsFolder: './drizzle' });
  const payer = actor();
  await database.db.insert(profiles).values({ id: payer.id, displayName: 'Fixture' });
  const groups = createGroupService(database.db, config(2));
  const billing = createBillingService(database.db, config(2));
  try {
    const selected = await groups.create(payer, 'Selected', '', crypto.randomUUID());
    const other = await groups.create(payer, 'Other', '', crypto.randomUUID());
    const intent = await billing.createIntent(payer, selected.id);
    if (!intent.testSubscriptionId) throw new Error('Expected test subscription');
    await billing.reconcileIntent(payer, intent.id, intent.testSubscriptionId);
    expect((await billing.entitlement(payer, selected.id)).upgraded).toBe(true);
    expect((await billing.entitlement(payer, other.id)).upgraded).toBe(false);
    await expect(
      billing.reconcileIntent(payer, (await billing.createIntent(payer, other.id)).id, intent.testSubscriptionId),
    ).rejects.toMatchObject({ status: 409 });
    await database.db
      .update(subscriptions)
      .set({ expiresAt: new Date(0) })
      .where(eq(subscriptions.groupId, selected.id));
    expect((await billing.entitlement(payer, selected.id)).upgraded).toBe(false);
    const [job] = await database.db
      .insert(jobs)
      .values({ kind: 'unknown_fixture', dedupeKey: crypto.randomUUID(), payload: {}, runAt: new Date(0) })
      .returning({ id: jobs.id });
    if (!job) throw new Error('Job insert failed');
    const worker = createJobService(database.db, config(2));
    await worker.runOne();
    const resumed = createJobService(database.db, config(2));
    const [persisted] = await database.db
      .select({ attempts: jobs.attempts, completedAt: jobs.completedAt })
      .from(jobs)
      .where(eq(jobs.id, job.id));
    expect(persisted?.attempts).toBe(1);
    expect(persisted?.completedAt).toBeNull();
    expect(resumed).toBeDefined();
  } finally {
    await database.close();
  }
});

integration('private image lifecycle enforces ownership, size, content, and reveal', async () => {
  const database = createDatabase(config(3).databaseUrl);
  await migrate(database.db, { migrationsFolder: './drizzle' });
  const owner = actor();
  const peer = actor();
  const outsider = actor();
  for (const person of [owner, peer, outsider])
    await database.db.insert(profiles).values({ id: person.id, displayName: 'Fixture' });
  const groupService = createGroupService(database.db, config(3));
  const challengeService = createChallengeService(database.db, config(3));
  const submissionService = createSubmissionService(database.db, config(3));
  const { createMediaService } = await import('../src/media/service');
  const { default: sharp } = await import('sharp');
  const media = createMediaService(database.db, { ...config(3), supabaseServiceKey: 'sb_secret_fixture' });
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push(`${init?.method ?? 'GET'} ${String(input)}`);
    if (init?.method === 'POST' || init?.method === undefined) {
      const headers = new Headers(init?.headers);
      expect(headers.get('apikey')).toBe('sb_secret_fixture');
      expect(headers.has('authorization')).toBe(false);
    }
    if (init?.method === 'POST') return Response.json({ Key: 'fixture' });
    if (init?.method === 'DELETE') return Response.json([]);
    return new Response(new Uint8Array([1, 2, 3]));
  };
  globalThis.fetch = Object.assign(fakeFetch, { preconnect: originalFetch.preconnect });
  try {
    const group = await groupService.create(owner, 'Media fixture', '', crypto.randomUUID());
    const invite = await groupService.invite(owner, group.id, 1);
    await groupService.acceptInvite(peer, invite.token);
    const created = await challengeService.create(
      owner,
      group.id,
      {
        title: 'Picture',
        description: '',
        criteria: 'Show it',
        proofFormats: ['image', 'text'],
        deadlineAt: new Date(Date.now() + 60000).toISOString(),
      },
      crypto.randomUUID(),
    );
    await challengeService.publish(owner, created.id);
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    const request = (body: Uint8Array, claimedSize = body.byteLength): Request => {
      const buffer = new ArrayBuffer(body.byteLength);
      new Uint8Array(buffer).set(body);
      return new Request('http://localhost/upload', {
        method: 'POST',
        headers: { 'content-length': String(claimedSize) },
        body: buffer,
      });
    };
    await expect(media.upload(outsider, created.id, request(png))).rejects.toMatchObject({ status: 403 });
    await expect(media.upload(owner, created.id, request(png, 1048577))).rejects.toMatchObject({ status: 413 });
    await expect(media.upload(owner, created.id, request(new Uint8Array([1, 2, 3])))).rejects.toMatchObject({
      status: 415,
    });
    const upload = await media.upload(owner, created.id, request(png));
    await submissionService.submit(owner, created.id, { attachmentIds: [upload.id] }, crypto.randomUUID());
    await expect(media.read(peer, upload.id)).rejects.toMatchObject({ status: 403 });
    await submissionService.submit(peer, created.id, { text: 'My proof', attachmentIds: [] }, crypto.randomUUID());
    expect((await media.read(peer, upload.id)).status).toBe(200);
    expect(requests.some((item) => item.includes('/object/authenticated/'))).toBe(true);
    const deadlineChallenge = await challengeService.create(
      owner,
      group.id,
      {
        title: 'Deadline',
        description: '',
        criteria: 'Image',
        proofFormats: ['image'],
        deadlineAt: new Date(Date.now() + 60000).toISOString(),
      },
      crypto.randomUUID(),
    );
    await challengeService.publish(owner, deadlineChallenge.id);
    const earlyUpload = await media.upload(owner, deadlineChallenge.id, request(png));
    await database.db
      .update(challengeRows)
      .set({ deadlineAt: sql`clock_timestamp() - interval '1 millisecond'` })
      .where(eq(challengeRows.id, deadlineChallenge.id));
    await expect(
      submissionService.submit(owner, deadlineChallenge.id, { attachmentIds: [earlyUpload.id] }, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(submissionService.feed(owner, deadlineChallenge.id, 20)).rejects.toMatchObject({ status: 403 });
    const abandoned = await media.upload(owner, created.id, request(png));
    await media.removeAbandoned(owner, abandoned.id);
    await database.db
      .update(jobs)
      .set({ runAt: new Date(0) })
      .where(eq(jobs.dedupeKey, `delete_attachment:${abandoned.id}`));
    const worker = createJobService(database.db, config(3));
    await worker.runOne();
    const [left] = await database.db
      .select({ id: attachments.id })
      .from(attachments)
      .where(eq(attachments.id, abandoned.id));
    expect(left).toBeUndefined();
  } finally {
    globalThis.fetch = originalFetch;
    await database.close();
  }
});

integration('reauthenticated deletion archives sole-owner groups and finishes through a durable job', async () => {
  const database = createDatabase(config(2).databaseUrl);
  await migrate(database.db, { migrationsFolder: './drizzle' });
  const owner = actor();
  await database.db.insert(profiles).values({ id: owner.id, displayName: 'Fixture' });
  const groupService = createGroupService(database.db, config(2));
  const { createUserService } = await import('../src/users/service');
  const users = createUserService(database.db);
  const originalFetch = globalThis.fetch;
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (String(input).includes(`/auth/v1/admin/users/${owner.id}`) && init?.method === 'DELETE')
      return new Response(null, { status: 204 });
    throw new Error('Unexpected external request');
  };
  globalThis.fetch = Object.assign(fakeFetch, { preconnect: originalFetch.preconnect });
  try {
    const group = await groupService.create(owner, 'Deletion fixture', '', crypto.randomUUID());
    await users.requestDeletion(owner);
    const [pending] = await database.db
      .select({ at: profiles.deletionRequestedAt })
      .from(profiles)
      .where(eq(profiles.id, owner.id));
    const [archived] = await database.db
      .select({ at: groupRows.archivedAt })
      .from(groupRows)
      .where(eq(groupRows.id, group.id));
    expect(pending?.at).toBeInstanceOf(Date);
    expect(archived?.at).toBeInstanceOf(Date);
    const [member] = await database.db
      .select({ active: memberships.active })
      .from(memberships)
      .where(and(eq(memberships.groupId, group.id), eq(memberships.userId, owner.id)));
    expect(member?.active).toBe(false);
    const worker = createJobService(database.db, config(2));
    for (let i = 0; i < 20; i += 1) {
      await worker.runOne();
      const [done] = await database.db
        .select({ completedAt: jobs.completedAt })
        .from(jobs)
        .where(eq(jobs.dedupeKey, `delete_account:${owner.id}`));
      if (done?.completedAt) break;
    }
    const [scrubbed] = await database.db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, owner.id));
    expect(scrubbed?.displayName).toBe('Deleted member');
  } finally {
    globalThis.fetch = originalFetch;
    await database.close();
  }
});

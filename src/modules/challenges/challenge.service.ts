import type { Database } from '@infra/database/database.client';
import { challenges, participants, submissions } from '@infra/database/database.schema';
import { idempotent } from '@infra/database/idempotency';
import type { Actor } from '@modules/auth/auth.service';
import { activeMembership, isPaid, lockGroup } from '@modules/groups/group.repository';
import { fail } from '@shared/errors/app-error';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Config } from '@/app/config/env';

export type ChallengeInput = {
  title: string;
  description: string;
  criteria: string;
  proofFormats: string[];
  deadlineAt: string;
};
const allowedFormats = new Set(['text', 'image', 'link']);
const validateChallenge = (input: ChallengeInput): void => {
  if (input.proofFormats.length === 0 || input.proofFormats.some((item) => !allowedFormats.has(item)))
    fail(400, 'bad_request', 'Unsupported proof format');
  if (Number.isNaN(Date.parse(input.deadlineAt))) fail(400, 'bad_request', 'Invalid deadline');
};
export type ChallengeService = ReturnType<typeof createChallengeService>;

export const createChallengeService = (db: Database, config: Config) => ({
  create: async (actor: Actor, groupId: string, input: ChallengeInput, key: string) => {
    validateChallenge(input);
    return db.transaction(async (tx) => {
      const group = await lockGroup(tx, groupId);
      if (group.archivedAt) return fail(409, 'conflict', 'Group archived');
      await activeMembership(tx, groupId, actor.id);
      const id = await idempotent(tx, actor.id, 'challenge.create', key, { groupId, input }, async () => {
        const [challenge] = await tx
          .insert(challenges)
          .values({ groupId, creatorId: actor.id, ...input, deadlineAt: new Date(input.deadlineAt) })
          .returning({ id: challenges.id });
        return challenge?.id ?? fail(503, 'unavailable', 'Challenge creation failed');
      });
      return { id };
    });
  },
  updateDraft: async (actor: Actor, challengeId: string, input: ChallengeInput) => {
    validateChallenge(input);
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: challenges.id,
          creatorId: challenges.creatorId,
          groupId: challenges.groupId,
          publishedAt: challenges.publishedAt,
        })
        .from(challenges)
        .where(eq(challenges.id, challengeId));
      if (!row) return fail(404, 'not_found', 'Challenge not found');
      const group = await lockGroup(tx, row.groupId);
      if (group.archivedAt || row.publishedAt) return fail(409, 'conflict', 'Challenge cannot be edited');
      if (row.creatorId !== actor.id) return fail(403, 'forbidden', 'Creator required');
      await activeMembership(tx, row.groupId, actor.id);
      const [updated] = await tx
        .update(challenges)
        .set({ ...input, deadlineAt: new Date(input.deadlineAt) })
        .where(eq(challenges.id, challengeId))
        .returning({ id: challenges.id });
      return updated ?? fail(404, 'not_found', 'Challenge not found');
    });
  },
  publish: async (actor: Actor, challengeId: string) =>
    db.transaction(async (tx) => {
      const [found] = await tx
        .select({ groupId: challenges.groupId })
        .from(challenges)
        .where(eq(challenges.id, challengeId));
      if (!found) return fail(404, 'not_found', 'Challenge not found');
      const group = await lockGroup(tx, found.groupId);
      if (group.archivedAt) return fail(409, 'conflict', 'Group archived');
      const [challenge] = await tx
        .select({
          id: challenges.id,
          creatorId: challenges.creatorId,
          deadlineAt: challenges.deadlineAt,
          publishedAt: challenges.publishedAt,
          cancelledAt: challenges.cancelledAt,
        })
        .from(challenges)
        .where(eq(challenges.id, challengeId))
        .for('update');
      if (!challenge || challenge.creatorId !== actor.id) return fail(403, 'forbidden', 'Creator required');
      await activeMembership(tx, found.groupId, actor.id);
      if (challenge.publishedAt || challenge.cancelledAt)
        return fail(409, 'conflict', 'Challenge already published or cancelled');
      const [clock] = await tx.execute(
        sql`select (extract(epoch from clock_timestamp()) * 1000)::double precision as now_ms`,
      );
      if (typeof clock?.now_ms !== 'number' || challenge.deadlineAt.getTime() <= clock.now_ms)
        return fail(409, 'conflict', 'Deadline must be in the future');
      const [count] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(challenges)
        .where(
          and(
            eq(challenges.groupId, found.groupId),
            isNull(challenges.cancelledAt),
            gt(challenges.deadlineAt, sql`clock_timestamp()`),
            sql`${challenges.publishedAt} is not null`,
          ),
        );
      const limit = (await isPaid(tx, found.groupId)) ? config.paidActiveChallenges : config.freeActiveChallenges;
      if ((count?.value ?? 0) >= limit) return fail(409, 'conflict', 'Active challenge limit reached');
      await tx.execute(
        sql`insert into challenge_participants (challenge_id, user_id, membership_id) select ${challengeId}::uuid, user_id, id from memberships where group_id = ${found.groupId}::uuid and active = true`,
      );
      await tx.update(challenges).set({ publishedAt: sql`clock_timestamp()` }).where(eq(challenges.id, challengeId));
      return { id: challengeId, published: true };
    }),
  cancel: async (actor: Actor, challengeId: string): Promise<void> =>
    db.transaction(async (tx) => {
      const [found] = await tx
        .select({ groupId: challenges.groupId })
        .from(challenges)
        .where(eq(challenges.id, challengeId));
      if (!found) return fail(404, 'not_found', 'Challenge not found');
      const group = await lockGroup(tx, found.groupId);
      const [challenge] = await tx
        .select({ creatorId: challenges.creatorId, cancelledAt: challenges.cancelledAt })
        .from(challenges)
        .where(eq(challenges.id, challengeId))
        .for('update');
      if (group.archivedAt) return fail(409, 'conflict', 'Group archived');
      if (challenge?.creatorId !== actor.id && group.ownerId !== actor.id)
        return fail(403, 'forbidden', 'Creator or owner required');
      await activeMembership(tx, found.groupId, actor.id);
      if (!challenge?.cancelledAt)
        await tx.update(challenges).set({ cancelledAt: sql`now()` }).where(eq(challenges.id, challengeId));
    }),
  get: async (actor: Actor, challengeId: string) => {
    const [challenge] = await db
      .select({
        id: challenges.id,
        groupId: challenges.groupId,
        creatorId: challenges.creatorId,
        title: challenges.title,
        description: challenges.description,
        criteria: challenges.criteria,
        proofFormats: challenges.proofFormats,
        deadlineAt: challenges.deadlineAt,
        publishedAt: challenges.publishedAt,
        cancelledAt: challenges.cancelledAt,
      })
      .from(challenges)
      .where(eq(challenges.id, challengeId));
    if (!challenge) return fail(404, 'not_found', 'Challenge not found');
    const membership = await activeMembership(db, challenge.groupId, actor.id);
    if (!challenge.publishedAt && challenge.creatorId !== actor.id)
      return fail(404, 'not_found', 'Challenge not found');
    if (!challenge.publishedAt) return { ...challenge, eligible: false, ownSubmission: null, feedUnlocked: false };
    const [own] = await db
      .select({ id: submissions.id, acceptedAt: submissions.acceptedAt, deletedAt: submissions.deletedAt })
      .from(submissions)
      .where(and(eq(submissions.challengeId, challengeId), eq(submissions.userId, actor.id)));
    const eligible = await db.query.participants.findFirst({
      where: and(eq(participants.challengeId, challengeId), eq(participants.userId, actor.id)),
      columns: { membershipId: true },
    });
    const isEligible = eligible?.membershipId === membership.id;
    if (!isEligible) return fail(403, 'forbidden', 'Not eligible for this challenge');
    return {
      ...challenge,
      eligible: isEligible,
      ownSubmission: isEligible ? (own ?? null) : null,
      feedUnlocked: Boolean(isEligible && own && !own.deletedAt),
    };
  },
  list: async (actor: Actor, groupId: string, limit: number, cursor?: string) => {
    const membership = await activeMembership(db, groupId, actor.id);
    const rows = await db
      .select({
        id: challenges.id,
        title: challenges.title,
        description: challenges.description,
        criteria: challenges.criteria,
        proofFormats: challenges.proofFormats,
        deadlineAt: challenges.deadlineAt,
        publishedAt: challenges.publishedAt,
        cancelledAt: challenges.cancelledAt,
      })
      .from(challenges)
      .where(
        and(
          eq(challenges.groupId, groupId),
          sql`exists (select 1 from challenge_participants where challenge_id = ${challenges.id} and user_id = ${actor.id}::uuid and membership_id = ${membership.id}::uuid) or (${challenges.publishedAt} is null and ${challenges.creatorId} = ${actor.id})`,
          cursor ? sql`${challenges.id} < ${cursor}` : undefined,
        ),
      )
      .orderBy(desc(challenges.id))
      .limit(limit + 1);
    return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null };
  },
});

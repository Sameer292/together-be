import type { Database } from '@infra/database/database.client';
import { attachments, challenges, jobs, submissions } from '@infra/database/database.schema';
import { idempotent } from '@infra/database/idempotency';
import type { Actor } from '@modules/auth/auth.service';
import { lockGroup } from '@modules/groups/group.repository';
import { fail } from '@shared/errors/app-error';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Config } from '@/app/config/env';
import { participantAccess, revealAccess } from './submission.access';

export type ProofInput = { text?: string; link?: string; attachmentIds: string[] };
const validateProof = (proof: ProofInput, formats: string[], maxAttachments: number): void => {
  if (!proof.text && !proof.link && proof.attachmentIds.length === 0) fail(400, 'bad_request', 'Proof required');
  if (proof.text && (!formats.includes('text') || proof.text.length > 5000))
    fail(400, 'bad_request', 'Text proof unavailable');
  if (proof.link) {
    const url = (() => {
      try {
        return new URL(proof.link);
      } catch {
        return fail(400, 'bad_request', 'Invalid link');
      }
    })();
    if (
      !formats.includes('link') ||
      url.protocol !== 'https:' ||
      proof.link.length > 2048 ||
      url.username ||
      url.password
    )
      fail(400, 'bad_request', 'Invalid link');
  }
  if (
    proof.attachmentIds.length > maxAttachments ||
    new Set(proof.attachmentIds).size !== proof.attachmentIds.length ||
    (proof.attachmentIds.length > 0 && !formats.includes('image'))
  )
    fail(400, 'bad_request', 'Invalid attachments');
};
export type SubmissionService = ReturnType<typeof createSubmissionService>;

export const createSubmissionService = (db: Database, config: Config) => ({
  submit: async (actor: Actor, challengeId: string, proof: ProofInput, key: string) =>
    db.transaction(async (tx) => {
      const [found] = await tx
        .select({ groupId: challenges.groupId })
        .from(challenges)
        .where(eq(challenges.id, challengeId));
      if (!found) return fail(404, 'not_found', 'Challenge not found');
      const group = await lockGroup(tx, found.groupId);
      if (group.archivedAt) return fail(409, 'conflict', 'Group archived');
      await participantAccess(tx, challengeId, actor.id);
      const id = await idempotent(tx, actor.id, 'submission.create', key, { challengeId, proof }, async () => {
        const [locked] = await tx
          .select({ deadlineAt: challenges.deadlineAt })
          .from(challenges)
          .where(eq(challenges.id, challengeId))
          .for('update');
        const challenge = await participantAccess(tx, challengeId, actor.id);
        if (!locked || challenge.cancelledAt) return fail(409, 'conflict', 'Challenge unavailable');
        validateProof(proof, challenge.proofFormats, config.maxAttachmentsPerSubmission);
        const [existing] = await tx
          .select({ id: submissions.id })
          .from(submissions)
          .where(and(eq(submissions.challengeId, challengeId), eq(submissions.userId, actor.id)));
        if (existing) return fail(409, 'conflict', 'Already submitted');
        if (proof.attachmentIds.length) {
          const selected = await tx
            .select({
              id: attachments.id,
              ownerId: attachments.ownerId,
              challengeId: attachments.challengeId,
              state: attachments.state,
            })
            .from(attachments)
            .where(inArray(attachments.id, proof.attachmentIds))
            .for('update');
          if (
            selected.length !== proof.attachmentIds.length ||
            selected.some(
              (item) => item.ownerId !== actor.id || item.challengeId !== challengeId || item.state !== 'ready',
            )
          )
            return fail(400, 'bad_request', 'Attachment unavailable');
        }
        const [clock] = await tx.execute(
          sql`select (extract(epoch from clock_timestamp()) * 1000)::double precision as now_ms`,
        );
        if (typeof clock?.now_ms !== 'number' || clock.now_ms >= locked.deadlineAt.getTime())
          return fail(409, 'conflict', 'Deadline passed');
        const [saved] = await tx
          .insert(submissions)
          .values({
            challengeId,
            userId: actor.id,
            text: proof.text ?? null,
            link: proof.link ?? null,
            acceptedAt: new Date(clock.now_ms),
          })
          .returning({ id: submissions.id });
        if (!saved) return fail(503, 'unavailable', 'Submission failed');
        if (proof.attachmentIds.length)
          await tx
            .update(attachments)
            .set({ submissionId: saved.id, state: 'attached' })
            .where(inArray(attachments.id, proof.attachmentIds));
        await tx
          .insert(jobs)
          .values({
            kind: 'submission_notice',
            dedupeKey: `submission_notice:${saved.id}`,
            payload: { challengeId, submitterId: actor.id },
          })
          .onConflictDoNothing();
        return saved.id;
      });
      return { id, accepted: true };
    }),
  own: async (actor: Actor, challengeId: string) => {
    await participantAccess(db, challengeId, actor.id);
    const [row] = await db
      .select({
        id: submissions.id,
        text: submissions.text,
        link: submissions.link,
        acceptedAt: submissions.acceptedAt,
        deletedAt: submissions.deletedAt,
      })
      .from(submissions)
      .where(and(eq(submissions.challengeId, challengeId), eq(submissions.userId, actor.id)));
    if (!row) return { submission: null };
    const media = await db
      .select({ id: attachments.id, mimeType: attachments.mimeType })
      .from(attachments)
      .where(and(eq(attachments.submissionId, row.id), eq(attachments.state, 'attached')));
    return { submission: { ...row, attachments: media } };
  },
  deleteOwn: async (actor: Actor, challengeId: string): Promise<void> =>
    db.transaction(async (tx) => {
      await participantAccess(tx, challengeId, actor.id);
      const [row] = await tx
        .update(submissions)
        .set({ deletedAt: sql`now()` })
        .where(
          and(
            eq(submissions.challengeId, challengeId),
            eq(submissions.userId, actor.id),
            isNull(submissions.deletedAt),
          ),
        )
        .returning({ id: submissions.id });
      if (!row) return fail(404, 'not_found', 'Submission not found');
    }),
  feed: async (actor: Actor, challengeId: string, limit: number, cursor?: string) => {
    await revealAccess(db, challengeId, actor.id);
    const rows = await db
      .select({
        id: submissions.id,
        userId: submissions.userId,
        text: submissions.text,
        link: submissions.link,
        acceptedAt: submissions.acceptedAt,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.challengeId, challengeId),
          isNull(submissions.deletedAt),
          cursor ? sql`${submissions.id} < ${cursor}` : undefined,
          sql`not exists (select 1 from blocks where (blocker_id = ${actor.id}::uuid and blocked_id = ${submissions.userId}) or (blocker_id = ${submissions.userId} and blocked_id = ${actor.id}::uuid))`,
        ),
      )
      .orderBy(desc(submissions.id))
      .limit(limit + 1);
    const visible = rows.slice(0, limit);
    const media = visible.length
      ? await db
          .select({ id: attachments.id, submissionId: attachments.submissionId, mimeType: attachments.mimeType })
          .from(attachments)
          .where(
            and(
              inArray(
                attachments.submissionId,
                visible.map((item) => item.id),
              ),
              eq(attachments.state, 'attached'),
            ),
          )
      : [];
    return {
      items: visible.map((item) => ({
        ...item,
        attachments: media
          .filter((attachment) => attachment.submissionId === item.id)
          .map(({ id, mimeType }) => ({ id, mimeType })),
      })),
      nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
    };
  },
});

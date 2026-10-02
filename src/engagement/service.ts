import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Actor } from '../auth/service';
import type { Database } from '../db';
import { blocks, challenges, comments, groups, reactions, submissions } from '../db/schema';
import { fail } from '../errors';
import { submissionAccess } from '../submissions/access';

const checkBlock = async (db: Database, actorId: string, targetId: string): Promise<void> => {
  const row = await db.query.blocks.findFirst({
    where: sql`(${blocks.blockerId} = ${actorId}::uuid and ${blocks.blockedId} = ${targetId}::uuid) or (${blocks.blockerId} = ${targetId}::uuid and ${blocks.blockedId} = ${actorId}::uuid)`,
  });
  if (row) fail(404, 'not_found', 'Submission not found');
};
const ensureOpen = async (db: Database, submissionId: string): Promise<void> => {
  const [row] = await db
    .select({ cancelledAt: challenges.cancelledAt, archivedAt: groups.archivedAt })
    .from(submissions)
    .innerJoin(challenges, eq(submissions.challengeId, challenges.id))
    .innerJoin(groups, eq(challenges.groupId, groups.id))
    .where(eq(submissions.id, submissionId));
  if (!row || row.cancelledAt || row.archivedAt) fail(409, 'conflict', 'Engagement closed');
};
export const createEngagementService = (db: Database) => ({
  addReaction: async (actor: Actor, submissionId: string, emoji: string): Promise<void> => {
    const submission = await submissionAccess(db, submissionId, actor.id);
    await checkBlock(db, actor.id, submission.userId);
    await ensureOpen(db, submissionId);
    await db.insert(reactions).values({ submissionId, userId: actor.id, emoji }).onConflictDoNothing();
  },
  removeReaction: async (actor: Actor, submissionId: string, emoji: string): Promise<void> => {
    await submissionAccess(db, submissionId, actor.id);
    await db
      .delete(reactions)
      .where(and(eq(reactions.submissionId, submissionId), eq(reactions.userId, actor.id), eq(reactions.emoji, emoji)));
  },
  listReactions: async (actor: Actor, submissionId: string) => {
    const submission = await submissionAccess(db, submissionId, actor.id);
    await checkBlock(db, actor.id, submission.userId);
    return db
      .select({ userId: reactions.userId, emoji: reactions.emoji })
      .from(reactions)
      .where(
        and(
          eq(reactions.submissionId, submissionId),
          sql`not exists (select 1 from blocks where (blocker_id = ${actor.id}::uuid and blocked_id = ${reactions.userId}) or (blocker_id = ${reactions.userId} and blocked_id = ${actor.id}::uuid))`,
        ),
      )
      .limit(100);
  },
  addComment: async (actor: Actor, submissionId: string, body: string) => {
    const submission = await submissionAccess(db, submissionId, actor.id);
    await checkBlock(db, actor.id, submission.userId);
    await ensureOpen(db, submissionId);
    const [comment] = await db
      .insert(comments)
      .values({ submissionId, authorId: actor.id, body })
      .returning({ id: comments.id, body: comments.body, createdAt: comments.createdAt });
    return comment ?? fail(503, 'unavailable', 'Comment failed');
  },
  listComments: async (actor: Actor, submissionId: string, limit: number, cursor?: string) => {
    const submission = await submissionAccess(db, submissionId, actor.id);
    await checkBlock(db, actor.id, submission.userId);
    const rows = await db
      .select({ id: comments.id, authorId: comments.authorId, body: comments.body, createdAt: comments.createdAt })
      .from(comments)
      .where(
        and(
          eq(comments.submissionId, submissionId),
          isNull(comments.deletedAt),
          cursor ? sql`${comments.id} < ${cursor}` : undefined,
          sql`not exists (select 1 from blocks where (blocker_id = ${actor.id}::uuid and blocked_id = ${comments.authorId}) or (blocker_id = ${comments.authorId} and blocked_id = ${actor.id}::uuid))`,
        ),
      )
      .orderBy(desc(comments.id))
      .limit(limit + 1);
    return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null };
  },
  deleteComment: async (actor: Actor, commentId: string): Promise<void> => {
    const [comment] = await db
      .select({ id: comments.id, submissionId: comments.submissionId, authorId: comments.authorId })
      .from(comments)
      .where(eq(comments.id, commentId));
    if (!comment) return fail(404, 'not_found', 'Comment not found');
    await submissionAccess(db, comment.submissionId, actor.id);
    if (comment.authorId !== actor.id) return fail(403, 'forbidden', 'Comment owner required');
    await db.update(comments).set({ deletedAt: sql`now()` }).where(eq(comments.id, commentId));
  },
});

import type { Database } from '@infra/database/database.client';
import { attachments, auditEvents, blocks, reports, submissions } from '@infra/database/database.schema';
import type { Actor } from '@modules/auth/auth.service';
import { submissionAccess } from '@modules/submissions/submission.access';
import { fail } from '@shared/errors/app-error';
import { and, desc, eq, sql } from 'drizzle-orm';

export type SafetyService = ReturnType<typeof createSafetyService>;

export const createSafetyService = (db: Database) => ({
  block: async (actor: Actor, targetId: string): Promise<void> => {
    if (targetId === actor.id) return fail(400, 'bad_request', 'Cannot block yourself');
    const shared = await db.execute(
      sql`select 1 from memberships a join memberships b on a.group_id = b.group_id where a.user_id = ${actor.id}::uuid and b.user_id = ${targetId}::uuid and a.active and b.active limit 1`,
    );
    if (!shared.length) return fail(404, 'not_found', 'Member not found');
    await db.insert(blocks).values({ blockerId: actor.id, blockedId: targetId }).onConflictDoNothing();
  },
  unblock: async (actor: Actor, targetId: string): Promise<void> => {
    await db.delete(blocks).where(and(eq(blocks.blockerId, actor.id), eq(blocks.blockedId, targetId)));
  },
  reportUser: async (actor: Actor, targetId: string, reason: string) => {
    const shared = await db.execute(
      sql`select 1 from memberships a join memberships b on a.group_id = b.group_id where a.user_id = ${actor.id}::uuid and b.user_id = ${targetId}::uuid and a.active and b.active limit 1`,
    );
    if (!shared.length) return fail(404, 'not_found', 'Member not found');
    const [report] = await db
      .insert(reports)
      .values({ reporterId: actor.id, targetUserId: targetId, reason })
      .returning({ id: reports.id });
    return report ?? fail(503, 'unavailable', 'Report failed');
  },
  reportSubmission: async (actor: Actor, submissionId: string, reason: string) => {
    await submissionAccess(db, submissionId, actor.id);
    const [report] = await db
      .insert(reports)
      .values({ reporterId: actor.id, submissionId, reason })
      .returning({ id: reports.id });
    return report ?? fail(503, 'unavailable', 'Report failed');
  },
  review: async (actor: Actor, reportId: string, state: 'dismissed' | 'actioned') =>
    db.transaction(async (tx) => {
      if (!actor.moderationRole) return fail(403, 'forbidden', 'Moderator required');
      const [report] = await tx
        .update(reports)
        .set({ state, reviewedBy: actor.id })
        .where(and(eq(reports.id, reportId), eq(reports.state, 'open')))
        .returning({ id: reports.id });
      if (!report) return fail(404, 'not_found', 'Open report not found');
      await tx
        .insert(auditEvents)
        .values({ actorId: actor.id, targetId: reportId, action: 'moderation.review', details: { state } });
      return report;
    }),
  listReports: async (actor: Actor, limit: number) => {
    if (!actor.moderationRole) return fail(403, 'forbidden', 'Moderator required');
    await db.insert(auditEvents).values({ actorId: actor.id, action: 'moderation.report_list' });
    return db
      .select({
        id: reports.id,
        reporterId: reports.reporterId,
        targetUserId: reports.targetUserId,
        submissionId: reports.submissionId,
        reason: reports.reason,
        state: reports.state,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.state, 'open'))
      .orderBy(desc(reports.createdAt))
      .limit(limit);
  },
  readReportedProof: async (actor: Actor, submissionId: string) => {
    if (!actor.moderationRole) return fail(403, 'forbidden', 'Moderator required');
    const report = await db.query.reports.findFirst({ where: eq(reports.submissionId, submissionId) });
    if (!report) return fail(404, 'not_found', 'Report not found');
    await db.insert(auditEvents).values({ actorId: actor.id, targetId: submissionId, action: 'moderation.proof_read' });
    const [proof] = await db
      .select({ id: submissions.id, text: submissions.text, link: submissions.link, userId: submissions.userId })
      .from(submissions)
      .where(eq(submissions.id, submissionId));
    if (!proof) return fail(404, 'not_found', 'Submission not found');
    const media = await db
      .select({ id: attachments.id, mimeType: attachments.mimeType })
      .from(attachments)
      .where(and(eq(attachments.submissionId, submissionId), eq(attachments.state, 'attached')));
    return { ...proof, attachments: media };
  },
});

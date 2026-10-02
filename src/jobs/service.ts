import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { createBillingService } from '../billing/service';
import type { Config } from '../config';
import type { Database } from '../db';
import { attachments, jobs } from '../db/schema';
import { createMediaService } from '../media/service';
import { createUserService } from '../users/service';

export const createJobService = (db: Database, config: Config) => {
  const media = createMediaService(db, config);
  const billing = createBillingService(db, config);
  const users = createUserService(db);
  const claim = async () =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: jobs.id, kind: jobs.kind, payload: jobs.payload, attempts: jobs.attempts })
        .from(jobs)
        .where(
          and(
            isNull(jobs.completedAt),
            isNull(jobs.failedAt),
            sql`${jobs.runAt} <= clock_timestamp()`,
            sql`(${jobs.lockedUntil} is null or ${jobs.lockedUntil} <= clock_timestamp())`,
          ),
        )
        .orderBy(jobs.runAt)
        .limit(1)
        .for('update', { skipLocked: true });
      if (!row) return null;
      await tx
        .update(jobs)
        .set({ attempts: row.attempts + 1, lockedUntil: sql`clock_timestamp() + interval '2 minutes'` })
        .where(eq(jobs.id, row.id));
      return row;
    });
  const payloadId = (payload: unknown, name: string): string => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !(name in payload) ||
      typeof payload[name as keyof typeof payload] !== 'string'
    )
      throw new Error('Invalid job payload');
    return payload[name as keyof typeof payload] as string;
  };
  const runOne = async (): Promise<boolean> => {
    const row = await claim();
    if (!row) return false;
    try {
      if (row.kind === 'delete_attachment') {
        const attachmentId = payloadId(row.payload, 'attachmentId');
        const [attachment] = await db
          .select({ objectKey: attachments.objectKey })
          .from(attachments)
          .where(eq(attachments.id, attachmentId));
        if (attachment) {
          await media.deleteObject(attachment.objectKey);
          await db
            .delete(attachments)
            .where(and(eq(attachments.id, attachmentId), eq(attachments.state, 'deletion_pending')));
        }
      } else if (row.kind === 'reconcile_subscription') {
        await billing.reconcileBound(payloadId(row.payload, 'subscriptionId'));
      } else if (row.kind === 'delete_account') {
        const userId = payloadId(row.payload, 'userId');
        const response = await fetch(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers: { apikey: config.supabaseServiceKey, Authorization: `Bearer ${config.supabaseServiceKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok && response.status !== 404) throw new Error('Auth deletion failed');
        await users.scrubDeleted(userId);
      } else if (row.kind === 'cleanup_uploads') {
        const stale = await db
          .select({ id: attachments.id })
          .from(attachments)
          .where(
            and(
              sql`${attachments.state} in ('ready','staged','deletion_pending')`,
              lt(attachments.createdAt, sql`clock_timestamp() - interval '24 hours'`),
            ),
          )
          .limit(100);
        for (const attachment of stale) {
          await db.update(attachments).set({ state: 'deletion_pending' }).where(eq(attachments.id, attachment.id));
          await db
            .insert(jobs)
            .values({
              kind: 'delete_attachment',
              dedupeKey: `delete_attachment:${attachment.id}`,
              payload: { attachmentId: attachment.id },
            })
            .onConflictDoNothing();
        }
        await db.insert(jobs).values({
          kind: 'cleanup_uploads',
          dedupeKey: `cleanup_uploads:${Date.now()}`,
          payload: {},
          runAt: new Date(Date.now() + 3600000),
        });
      } else if (row.kind === 'submission_notice') {
        // Test transport: notification content intentionally contains no proof or member identity.
        console.info(JSON.stringify({ event: 'notification', kind: 'challenge_activity' }));
      } else throw new Error('Unknown job kind');
      await db.update(jobs).set({ completedAt: sql`clock_timestamp()`, lockedUntil: null }).where(eq(jobs.id, row.id));
    } catch (error: unknown) {
      const terminal = row.attempts + 1 >= 5;
      await db
        .update(jobs)
        .set({
          lockedUntil: null,
          failedAt: terminal ? sql`clock_timestamp()` : null,
          runAt: sql`clock_timestamp() + (${Math.min(60, 2 ** row.attempts)}::int * interval '1 minute')`,
          lastError: error instanceof Error ? error.message.slice(0, 200) : 'Unknown error',
        })
        .where(eq(jobs.id, row.id));
    }
    return true;
  };
  const ensureCleanup = async (): Promise<void> => {
    const [pending] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.kind, 'cleanup_uploads'), isNull(jobs.completedAt), isNull(jobs.failedAt)))
      .limit(1);
    if (!pending)
      await db
        .insert(jobs)
        .values({ kind: 'cleanup_uploads', dedupeKey: `cleanup_uploads:${Date.now()}`, payload: {} });
  };
  return { runOne, ensureCleanup };
};

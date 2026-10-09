import type { Database } from '@infra/database/database.client';
import {
  attachments,
  comments,
  groups,
  jobs,
  memberships,
  profiles,
  submissions,
} from '@infra/database/database.schema';
import type { Actor } from '@modules/auth/auth.service';
import { lockGroup } from '@modules/groups/group.repository';
import { fail } from '@shared/errors/app-error';
import { and, eq, sql } from 'drizzle-orm';

export type UserService = ReturnType<typeof createUserService>;

export const createUserService = (db: Database) => ({
  me: async (actor: Actor) => {
    const [profile] = await db
      .select({
        id: profiles.id,
        displayName: profiles.displayName,
        bio: profiles.bio,
        createdAt: profiles.createdAt,
        deletionRequestedAt: profiles.deletionRequestedAt,
      })
      .from(profiles)
      .where(eq(profiles.id, actor.id));
    return profile ? { ...profile, email: actor.email } : fail(404, 'not_found', 'Profile not found');
  },
  update: async (actor: Actor, displayName: string, bio: string | null) => {
    const [profile] = await db
      .update(profiles)
      .set({ displayName, bio })
      .where(eq(profiles.id, actor.id))
      .returning({ id: profiles.id, displayName: profiles.displayName, bio: profiles.bio });
    return profile ?? fail(404, 'not_found', 'Profile not found');
  },
  requestDeletion: async (actor: Actor): Promise<void> =>
    db.transaction(async (tx) => {
      const owned = await tx.select({ id: groups.id }).from(groups).where(eq(groups.ownerId, actor.id));
      for (const item of owned) {
        await lockGroup(tx, item.id);
        const [count] = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(memberships)
          .where(and(eq(memberships.groupId, item.id), eq(memberships.active, true)));
        if ((count?.value ?? 0) > 1)
          return fail(409, 'conflict', 'Transfer ownership of groups with other members first');
        await tx
          .update(groups)
          .set({ archivedAt: sql`coalesce(${groups.archivedAt}, clock_timestamp())` })
          .where(eq(groups.id, item.id));
      }
      await tx
        .update(profiles)
        .set({ deletionRequestedAt: sql`coalesce(${profiles.deletionRequestedAt}, clock_timestamp())` })
        .where(eq(profiles.id, actor.id));
      await tx
        .update(memberships)
        .set({ active: false, leftAt: sql`clock_timestamp()` })
        .where(and(eq(memberships.userId, actor.id), eq(memberships.active, true)));
      await tx
        .insert(jobs)
        .values({ kind: 'delete_account', dedupeKey: `delete_account:${actor.id}`, payload: { userId: actor.id } })
        .onConflictDoNothing();
    }),
  scrubDeleted: async (userId: string): Promise<void> =>
    db.transaction(async (tx) => {
      await tx
        .update(submissions)
        .set({ text: null, link: null, deletedAt: sql`coalesce(${submissions.deletedAt}, clock_timestamp())` })
        .where(eq(submissions.userId, userId));
      await tx
        .update(comments)
        .set({ body: '[deleted]', deletedAt: sql`coalesce(${comments.deletedAt}, clock_timestamp())` })
        .where(eq(comments.authorId, userId));
      const owned = await tx.select({ id: attachments.id }).from(attachments).where(eq(attachments.ownerId, userId));
      for (const item of owned) {
        await tx.update(attachments).set({ state: 'deletion_pending' }).where(eq(attachments.id, item.id));
        await tx
          .insert(jobs)
          .values({
            kind: 'delete_attachment',
            dedupeKey: `delete_attachment:${item.id}`,
            payload: { attachmentId: item.id },
          })
          .onConflictDoNothing();
      }
      await tx.update(profiles).set({ displayName: 'Deleted member', bio: null }).where(eq(profiles.id, userId));
    }),
});

import { createHash, randomBytes } from 'node:crypto';
import type { Database } from '@infra/database/database.client';
import { auditEvents, groups, invitations, memberships } from '@infra/database/database.schema';
import { idempotent } from '@infra/database/idempotency';
import type { Actor } from '@modules/auth/auth.service';
import { fail } from '@shared/errors/app-error';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Config } from '@/app/config/env';
import { activeMembership, isPaid, lockGroup } from './group.repository';

export type GroupService = ReturnType<typeof createGroupService>;

export const createGroupService = (db: Database, config: Config) => ({
  create: async (actor: Actor, name: string, description: string, key: string) =>
    db.transaction(async (tx) => {
      const groupId = await idempotent(tx, actor.id, 'group.create', key, { name, description }, async () => {
        const [group] = await tx
          .insert(groups)
          .values({ name, description, ownerId: actor.id })
          .returning({ id: groups.id });
        if (!group) return fail(503, 'unavailable', 'Group creation failed');
        await tx.insert(memberships).values({ groupId: group.id, userId: actor.id, generation: 1 });
        return group.id;
      });
      const [result] = await tx
        .select({ id: groups.id, name: groups.name, description: groups.description })
        .from(groups)
        .where(eq(groups.id, groupId));
      return result ?? fail(503, 'unavailable', 'Group creation failed');
    }),
  list: async (actor: Actor, limit: number, cursor?: string) => {
    const rows = await db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        ownerId: groups.ownerId,
        archivedAt: groups.archivedAt,
        createdAt: groups.createdAt,
      })
      .from(memberships)
      .innerJoin(groups, eq(memberships.groupId, groups.id))
      .where(
        and(
          eq(memberships.userId, actor.id),
          eq(memberships.active, true),
          cursor ? sql`${groups.id} < ${cursor}` : undefined,
        ),
      )
      .orderBy(desc(groups.id))
      .limit(limit + 1);
    return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null };
  },
  get: async (actor: Actor, groupId: string) => {
    await activeMembership(db, groupId, actor.id);
    const rows = await db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        ownerId: groups.ownerId,
        archivedAt: groups.archivedAt,
      })
      .from(groups)
      .where(eq(groups.id, groupId));
    return rows[0] ?? fail(404, 'not_found', 'Group not found');
  },
  update: async (actor: Actor, groupId: string, name: string, description: string) =>
    db.transaction(async (tx) => {
      const group = await lockGroup(tx, groupId);
      if (group.ownerId !== actor.id) return fail(403, 'forbidden', 'Owner required');
      if (group.archivedAt) return fail(409, 'conflict', 'Group archived');
      const [updated] = await tx
        .update(groups)
        .set({ name, description })
        .where(eq(groups.id, groupId))
        .returning({ id: groups.id, name: groups.name, description: groups.description });
      return updated ?? fail(404, 'not_found', 'Group not found');
    }),
  archive: async (actor: Actor, groupId: string): Promise<void> =>
    db.transaction(async (tx) => {
      const group = await lockGroup(tx, groupId);
      if (group.ownerId !== actor.id) return fail(403, 'forbidden', 'Owner required');
      await tx
        .update(groups)
        .set({ archivedAt: sql`coalesce(${groups.archivedAt}, now())` })
        .where(eq(groups.id, groupId));
      await tx.insert(auditEvents).values({ actorId: actor.id, targetId: groupId, action: 'group.archived' });
    }),
  invite: async (actor: Actor, groupId: string, expiresInHours: number) =>
    db.transaction(async (tx) => {
      const group = await lockGroup(tx, groupId);
      if (group.ownerId !== actor.id) return fail(403, 'forbidden', 'Owner required');
      if (group.archivedAt) return fail(409, 'conflict', 'Group archived');
      const token = randomBytes(32).toString('base64url');
      const hash = createHash('sha256').update(token).digest('hex');
      const [invite] = await tx
        .insert(invitations)
        .values({
          groupId,
          tokenHash: hash,
          expiresAt: sql`clock_timestamp() + (${expiresInHours}::int * interval '1 hour')`,
          createdBy: actor.id,
        })
        .returning({ id: invitations.id, expiresAt: invitations.expiresAt });
      if (!invite) return fail(503, 'unavailable', 'Invitation failed');
      return { ...invite, token };
    }),
  revokeInvite: async (actor: Actor, groupId: string, inviteId: string): Promise<void> =>
    db.transaction(async (tx) => {
      const group = await lockGroup(tx, groupId);
      if (group.ownerId !== actor.id) return fail(403, 'forbidden', 'Owner required');
      await tx
        .update(invitations)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(invitations.id, inviteId), eq(invitations.groupId, groupId)));
    }),
  acceptInvite: async (actor: Actor, token: string) =>
    db.transaction(async (tx) => {
      const hash = createHash('sha256').update(token).digest('hex');
      const invite = await tx.query.invitations.findFirst({
        where: eq(invitations.tokenHash, hash),
        columns: { groupId: true, expiresAt: true, revokedAt: true },
      });
      if (!invite || invite.revokedAt) return fail(404, 'not_found', 'Invitation unavailable');
      const group = await lockGroup(tx, invite.groupId);
      if (group.archivedAt) return fail(409, 'conflict', 'Group archived');
      const existing = await tx.query.memberships.findFirst({
        where: and(eq(memberships.groupId, group.id), eq(memberships.userId, actor.id), eq(memberships.active, true)),
        columns: { id: true },
      });
      if (existing) return { groupId: group.id, joined: false };
      const [valid] = await tx
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(
            eq(invitations.tokenHash, hash),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, sql`clock_timestamp()`),
          ),
        );
      if (!valid) return fail(404, 'not_found', 'Invitation unavailable');
      const [count] = await tx
        .select({ value: sql<number>`count(*)::int` })
        .from(memberships)
        .where(and(eq(memberships.groupId, group.id), eq(memberships.active, true)));
      const capacity = (await isPaid(tx, group.id)) ? config.paidGroupCapacity : config.freeGroupCapacity;
      if ((count?.value ?? 0) >= capacity) return fail(409, 'conflict', 'Group full');
      const [last] = await tx
        .select({ generation: memberships.generation })
        .from(memberships)
        .where(and(eq(memberships.groupId, group.id), eq(memberships.userId, actor.id)))
        .orderBy(desc(memberships.generation))
        .limit(1);
      await tx
        .insert(memberships)
        .values({ groupId: group.id, userId: actor.id, generation: (last?.generation ?? 0) + 1 });
      return { groupId: group.id, joined: true };
    }),
  leave: async (actor: Actor, groupId: string): Promise<void> =>
    db.transaction(async (tx) => {
      const group = await lockGroup(tx, groupId);
      await activeMembership(tx, groupId, actor.id);
      if (group.ownerId === actor.id) return fail(409, 'conflict', 'Transfer ownership before leaving');
      await tx
        .update(memberships)
        .set({ active: false, leftAt: sql`now()` })
        .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, actor.id), eq(memberships.active, true)));
    }),
  remove: async (actor: Actor, groupId: string, userId: string): Promise<void> =>
    db.transaction(async (tx) => {
      const group = await lockGroup(tx, groupId);
      if (group.ownerId !== actor.id || userId === actor.id) return fail(403, 'forbidden', 'Owner required');
      await tx
        .update(memberships)
        .set({ active: false, leftAt: sql`now()` })
        .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId), eq(memberships.active, true)));
    }),
  transfer: async (actor: Actor, groupId: string, newOwnerId: string): Promise<void> =>
    db.transaction(async (tx) => {
      const group = await lockGroup(tx, groupId);
      if (group.ownerId !== actor.id) return fail(403, 'forbidden', 'Owner required');
      await activeMembership(tx, groupId, newOwnerId);
      await tx.update(groups).set({ ownerId: newOwnerId }).where(eq(groups.id, groupId));
      await tx
        .insert(auditEvents)
        .values({ actorId: actor.id, targetId: groupId, action: 'group.owner_transferred', details: { newOwnerId } });
    }),
});

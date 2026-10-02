import { and, eq, gt, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../db';
import { groups, memberships, subscriptions } from '../db/schema';
import { fail } from '../errors';

export const activeMembership = async (tx: Database | Transaction, groupId: string, actorId: string) => {
  const membership = await tx.query.memberships.findFirst({
    where: and(eq(memberships.groupId, groupId), eq(memberships.userId, actorId), eq(memberships.active, true)),
    columns: { id: true, generation: true },
  });
  if (!membership) return fail(403, 'forbidden', 'Active membership required');
  return membership;
};
export const lockGroup = async (tx: Transaction, groupId: string) => {
  const result = await tx
    .select({ id: groups.id, ownerId: groups.ownerId, archivedAt: groups.archivedAt })
    .from(groups)
    .where(eq(groups.id, groupId))
    .for('update');
  const group = result[0];
  if (!group) return fail(404, 'not_found', 'Group not found');
  return group;
};
export const isPaid = async (tx: Database | Transaction, groupId: string): Promise<boolean> => {
  const rows = await tx
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.groupId, groupId),
        sql`${subscriptions.status} in ('active', 'grace')`,
        gt(subscriptions.expiresAt, sql`clock_timestamp()`),
      ),
    )
    .limit(1);
  return rows.length > 0;
};

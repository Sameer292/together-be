import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Database } from '@infra/database/database.client';
import { billingEvents, jobs, memberships, subscriptions, upgradeIntents } from '@infra/database/database.schema';
import type { Actor } from '@modules/auth/auth.service';
import { activeMembership, lockGroup } from '@modules/groups/group.repository';
import { fail } from '@shared/errors/app-error';
import { isRecord } from '@shared/utils/validation';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Config } from '@/app/config/env';

type ProviderSubscription = {
  id: string;
  customerId: string;
  environment: 'sandbox' | 'production' | 'test';
  startsAt: number;
  endsAt: number;
  givesAccess: boolean;
  pendingPayment: boolean;
  ownership: string;
  status: string;
};
const record = (value: unknown): Record<string, unknown> | null => (isRecord(value) ? value : null);
export const verifyRevenueCatSignature = (
  raw: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
): boolean => {
  const parts = Object.fromEntries((header ?? '').split(',').map((part) => part.split('=', 2)));
  const timestamp = Number(parts.t);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > 300 ||
    !/^[a-f0-9]{64}$/i.test(parts.v1 ?? '')
  )
    return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest();
  const supplied = Buffer.from(parts.v1, 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
};
export type BillingService = ReturnType<typeof createBillingService>;

export const createBillingService = (db: Database, config: Config) => {
  const fetchSubscription = async (payerId: string, subscriptionId: string): Promise<ProviderSubscription> => {
    if (config.billingMode === 'test') {
      const prefix = `test:${payerId}:`;
      const startsAt = Number(subscriptionId.slice(prefix.length));
      if (!subscriptionId.startsWith(prefix) || !Number.isSafeInteger(startsAt) || startsAt < 1)
        return fail(404, 'not_found', 'Test subscription unavailable');
      return {
        id: subscriptionId,
        customerId: payerId,
        environment: 'test',
        startsAt,
        endsAt: startsAt + 30 * 86400000,
        givesAccess: true,
        pendingPayment: false,
        ownership: 'purchased',
        status: 'active',
      };
    }
    const url = `https://api.revenuecat.com/v2/projects/${encodeURIComponent(config.revenueCatProjectId ?? '')}/subscriptions/${encodeURIComponent(subscriptionId)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${config.revenueCatApiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return fail(503, 'unavailable', 'Billing provider unavailable');
    const payload: unknown = await response.json();
    const item = record(payload);
    if (item?.id !== subscriptionId) return fail(404, 'not_found', 'Verified subscription unavailable');
    if (
      !item ||
      typeof item.id !== 'string' ||
      typeof item.customer_id !== 'string' ||
      typeof item.starts_at !== 'number' ||
      typeof item.current_period_ends_at !== 'number' ||
      typeof item.gives_access !== 'boolean' ||
      typeof item.pending_payment !== 'boolean' ||
      typeof item.ownership !== 'string' ||
      typeof item.status !== 'string' ||
      (item.environment !== 'sandbox' && item.environment !== 'production')
    )
      return fail(404, 'not_found', 'Verified subscription unavailable');
    return {
      id: item.id,
      customerId: item.customer_id,
      environment: item.environment,
      startsAt: item.starts_at,
      endsAt: item.current_period_ends_at,
      givesAccess: item.gives_access,
      pendingPayment: item.pending_payment,
      ownership: item.ownership,
      status: item.status,
    };
  };
  const reconcileBound = async (subscriptionId: string): Promise<void> => {
    const [bound] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
    if (!bound) return;
    const verified = await fetchSubscription(bound.payerId, bound.providerSubscriptionId);
    if (verified.customerId !== bound.payerId || verified.environment !== bound.environment)
      return fail(409, 'conflict', 'Subscription mismatch');
    await db.transaction(async (tx) => {
      await lockGroup(tx, bound.groupId);
      const status =
        verified.givesAccess && !verified.pendingPayment && verified.endsAt > Date.now()
          ? verified.status === 'in_grace_period'
            ? 'grace'
            : 'active'
          : 'expired';
      await tx
        .update(subscriptions)
        .set({ status, expiresAt: new Date(verified.endsAt), providerUpdatedAt: sql`clock_timestamp()` })
        .where(eq(subscriptions.id, bound.id));
    });
  };
  return {
    entitlement: async (actor: Actor, groupId: string) => {
      await activeMembership(db, groupId, actor.id);
      const [row] = await db
        .select({ status: subscriptions.status, expiresAt: subscriptions.expiresAt })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.groupId, groupId),
            sql`${subscriptions.status} in ('active','grace')`,
            gt(subscriptions.expiresAt, sql`now()`),
          ),
        )
        .limit(1);
      return { upgraded: Boolean(row), status: row?.status ?? 'free', expiresAt: row?.expiresAt ?? null };
    },
    createIntent: async (actor: Actor, groupId: string) =>
      db.transaction(async (tx) => {
        const group = await lockGroup(tx, groupId);
        if (group.archivedAt) return fail(409, 'conflict', 'Group archived');
        const membership = await activeMembership(tx, groupId, actor.id);
        await tx
          .update(subscriptions)
          .set({ status: 'expired' })
          .where(
            and(
              eq(subscriptions.groupId, groupId),
              sql`${subscriptions.status} in ('active','grace')`,
              sql`${subscriptions.expiresAt} <= clock_timestamp()`,
            ),
          );
        const [current] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.groupId, groupId),
              sql`${subscriptions.status} in ('active','grace')`,
              gt(subscriptions.expiresAt, sql`now()`),
            ),
          )
          .limit(1);
        if (current) return fail(409, 'conflict', 'Group already sponsored');
        const [intent] = await tx
          .insert(upgradeIntents)
          .values({
            groupId,
            payerId: actor.id,
            membershipId: membership.id,
            environment: config.billingMode === 'test' ? 'test' : config.revenueCatEnvironment,
          })
          .returning({ id: upgradeIntents.id, createdAt: upgradeIntents.createdAt });
        return intent
          ? {
              id: intent.id,
              revenueCatAppUserId: actor.id,
              testSubscriptionId:
                config.billingMode === 'test' ? `test:${actor.id}:${intent.createdAt.getTime()}` : undefined,
            }
          : fail(503, 'unavailable', 'Intent failed');
      }),
    reconcileIntent: async (actor: Actor, intentId: string, subscriptionId: string) => {
      const intent = await db.query.upgradeIntents.findFirst({
        where: and(eq(upgradeIntents.id, intentId), eq(upgradeIntents.payerId, actor.id)),
      });
      if (!intent) return fail(404, 'not_found', 'Intent not found');
      if (Date.now() - intent.createdAt.getTime() > 3600000) return fail(409, 'conflict', 'Intent expired');
      const verified = await fetchSubscription(actor.id, subscriptionId);
      if (
        verified.customerId !== actor.id ||
        verified.environment !== intent.environment ||
        verified.startsAt < intent.createdAt.getTime() - 300000 ||
        verified.ownership !== 'purchased' ||
        verified.pendingPayment ||
        !verified.givesAccess ||
        verified.endsAt <= Date.now()
      )
        return fail(409, 'conflict', 'Purchase not eligible for this intent');
      return db.transaction(async (tx) => {
        await lockGroup(tx, intent.groupId);
        const [currentIntent] = await tx
          .select()
          .from(upgradeIntents)
          .where(eq(upgradeIntents.id, intentId))
          .for('update');
        if (!currentIntent) return fail(404, 'not_found', 'Intent not found');
        const [existing] = await tx
          .select({ id: subscriptions.id, groupId: subscriptions.groupId, payerId: subscriptions.payerId })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.providerSubscriptionId, verified.id),
              eq(subscriptions.environment, verified.environment),
            ),
          );
        if (existing) {
          if (existing.groupId !== intent.groupId || existing.payerId !== actor.id)
            return fail(409, 'conflict', 'Subscription already bound');
          return { groupId: existing.groupId, upgraded: true };
        }
        if (currentIntent.consumedAt) return fail(409, 'conflict', 'Intent already used');
        const [membership] = await tx
          .select({ joinedAt: memberships.joinedAt, leftAt: memberships.leftAt })
          .from(memberships)
          .where(eq(memberships.id, currentIntent.membershipId));
        if (
          !membership ||
          membership.joinedAt.getTime() > verified.startsAt ||
          (membership.leftAt && membership.leftAt.getTime() <= verified.startsAt)
        )
          return fail(409, 'conflict', 'Payer was not active at purchase');
        await tx
          .update(subscriptions)
          .set({ status: 'expired' })
          .where(
            and(
              eq(subscriptions.groupId, intent.groupId),
              sql`${subscriptions.status} in ('active','grace')`,
              sql`${subscriptions.expiresAt} <= clock_timestamp()`,
            ),
          );
        const [conflict] = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.groupId, intent.groupId),
              sql`${subscriptions.status} in ('active','grace')`,
              gt(subscriptions.expiresAt, sql`now()`),
            ),
          )
          .limit(1);
        if (conflict) return fail(409, 'conflict', 'Group already sponsored');
        await tx.insert(subscriptions).values({
          providerSubscriptionId: verified.id,
          environment: verified.environment,
          groupId: intent.groupId,
          payerId: actor.id,
          status: verified.status === 'in_grace_period' ? 'grace' : 'active',
          expiresAt: new Date(verified.endsAt),
          providerUpdatedAt: new Date(),
        });
        await tx.update(upgradeIntents).set({ consumedAt: sql`now()` }).where(eq(upgradeIntents.id, intentId));
        return { groupId: intent.groupId, upgraded: true };
      });
    },
    webhook: async (raw: string, signature: string | null): Promise<void> => {
      if (
        config.billingMode !== 'revenuecat' ||
        !config.revenueCatWebhookSecret ||
        !verifyRevenueCatSignature(raw, signature, config.revenueCatWebhookSecret, Math.floor(Date.now() / 1000))
      )
        return fail(401, 'unauthorized', 'Invalid webhook');
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return fail(400, 'bad_request', 'Invalid webhook');
      }
      const event = record(record(parsed)?.event);
      if (
        !event ||
        typeof event.id !== 'string' ||
        typeof event.app_user_id !== 'string' ||
        typeof event.environment !== 'string'
      )
        return fail(400, 'bad_request', 'Invalid webhook');
      const environment = event.environment.toLowerCase();
      if (environment !== 'production' && environment !== 'sandbox')
        return fail(400, 'bad_request', 'Invalid webhook environment');
      const eventId = event.id;
      const identifiers = [
        event.app_user_id,
        event.original_app_user_id,
        ...(Array.isArray(event.aliases) ? event.aliases : []),
      ].filter(
        (value): value is string =>
          typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
      );
      await db.transaction(async (tx) => {
        const [saved] = await tx
          .insert(billingEvents)
          .values({ providerEventId: eventId, environment, payload: parsed })
          .onConflictDoNothing()
          .returning({ id: billingEvents.id });
        if (!saved) return;
        if (!identifiers.length) return;
        const bound = await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(and(inArray(subscriptions.payerId, identifiers), eq(subscriptions.environment, environment)));
        for (const item of bound)
          await tx.insert(jobs).values({
            kind: 'reconcile_subscription',
            dedupeKey: `reconcile_subscription:${saved.id}:${item.id}`,
            payload: { subscriptionId: item.id },
          });
      });
    },
    reconcileBound,
  };
};

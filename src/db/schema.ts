import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  moderationRole: boolean('moderation_role').notNull().default(false),
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  createdAt: createdAt(),
});
export const groups = pgTable('groups', {
  id: id(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => profiles.id),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: createdAt(),
});
export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    generation: integer('generation').notNull(),
    active: boolean('active').notNull().default(true),
    joinedAt: createdAt(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('membership_generation_unique').on(table.groupId, table.userId, table.generation),
    uniqueIndex('membership_active_unique').on(table.groupId, table.userId).where(sql`${table.active} = true`),
    index('memberships_user_active_idx').on(table.userId, table.active),
    check('membership_generation_positive', sql`${table.generation} > 0`),
    check(
      'membership_active_dates',
      sql`(${table.active} and ${table.leftAt} is null) or (not ${table.active} and ${table.leftAt} is not null)`,
    ),
  ],
);
export const invitations = pgTable('invitations', {
  id: id(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => groups.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: createdAt(),
});
export const challenges = pgTable(
  'challenges',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => profiles.id),
    title: text('title').notNull(),
    description: text('description').notNull(),
    criteria: text('criteria').notNull(),
    proofFormats: text('proof_formats').array().notNull(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index('challenges_group_idx').on(table.groupId, table.createdAt),
    check('challenge_proof_formats_nonempty', sql`cardinality(${table.proofFormats}) > 0`),
    check('challenge_proof_formats_supported', sql`${table.proofFormats} <@ array['text','image','link']::text[]`),
  ],
);
export const participants = pgTable(
  'challenge_participants',
  {
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => challenges.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
  },
  (table) => [
    primaryKey({ columns: [table.challengeId, table.userId] }),
    index('participants_user_idx').on(table.userId),
  ],
);
export const submissions = pgTable(
  'submissions',
  {
    id: id(),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => challenges.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    text: text('text'),
    link: text('link'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('submission_once_unique').on(table.challengeId, table.userId),
    index('submissions_feed_idx').on(table.challengeId, table.acceptedAt),
  ],
);
export const attachments = pgTable(
  'attachments',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => challenges.id),
    submissionId: uuid('submission_id').references(() => submissions.id),
    objectKey: text('object_key').notNull().unique(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    state: text('state').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('attachments_cleanup_idx').on(table.state, table.createdAt),
    check('attachment_size_positive', sql`${table.byteSize} > 0`),
    check('attachment_state_valid', sql`${table.state} in ('staged','ready','attached','deletion_pending')`),
    check('attachment_attached_submission', sql`${table.state} <> 'attached' or ${table.submissionId} is not null`),
  ],
);
export const comments = pgTable(
  'comments',
  {
    id: id(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id),
    authorId: uuid('author_id')
      .notNull()
      .references(() => profiles.id),
    body: text('body').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index('comments_submission_idx').on(table.submissionId, table.createdAt)],
);
export const reactions = pgTable(
  'reactions',
  {
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    emoji: text('emoji').notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.submissionId, table.userId, table.emoji] })],
);
export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => profiles.id),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => profiles.id),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    check('blocks_distinct', sql`${table.blockerId} <> ${table.blockedId}`),
  ],
);
export const reports = pgTable(
  'reports',
  {
    id: id(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => profiles.id),
    targetUserId: uuid('target_user_id').references(() => profiles.id),
    submissionId: uuid('submission_id').references(() => submissions.id),
    reason: text('reason').notNull(),
    state: text('state').notNull().default('open'),
    reviewedBy: uuid('reviewed_by').references(() => profiles.id),
    createdAt: createdAt(),
  },
  (table) => [
    check('report_one_target', sql`num_nonnulls(${table.targetUserId}, ${table.submissionId}) = 1`),
    check('report_state_valid', sql`${table.state} in ('open','dismissed','actioned')`),
  ],
);
export const upgradeIntents = pgTable(
  'upgrade_intents',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id),
    payerId: uuid('payer_id')
      .notNull()
      .references(() => profiles.id),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    environment: text('environment').notNull(),
    createdAt: createdAt(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [check('intent_environment_valid', sql`${table.environment} in ('test','sandbox','production')`)],
);
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    providerSubscriptionId: text('provider_subscription_id').notNull(),
    environment: text('environment').notNull(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id),
    payerId: uuid('payer_id')
      .notNull()
      .references(() => profiles.id),
    status: text('status').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('subscription_provider_unique').on(table.providerSubscriptionId, table.environment),
    uniqueIndex('subscription_group_active_unique')
      .on(table.groupId)
      .where(sql`${table.status} in ('active', 'grace')`),
    check('subscription_status_valid', sql`${table.status} in ('active','grace','expired')`),
    check('subscription_environment_valid', sql`${table.environment} in ('test','sandbox','production')`),
  ],
);
export const billingEvents = pgTable(
  'billing_events',
  {
    id: id(),
    providerEventId: text('provider_event_id').notNull(),
    environment: text('environment').notNull(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
    payload: jsonb('payload').notNull(),
    receivedAt: createdAt(),
  },
  (table) => [
    uniqueIndex('billing_event_provider_unique').on(table.providerEventId, table.environment),
    check('billing_event_environment_valid', sql`${table.environment} in ('sandbox','production')`),
  ],
);
export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    payload: jsonb('payload').notNull(),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (table) => [
    index('jobs_ready_idx').on(table.runAt, table.lockedUntil),
    check('jobs_attempts_nonnegative', sql`${table.attempts} >= 0`),
  ],
);
export const auditEvents = pgTable('audit_events', {
  id: id(),
  actorId: uuid('actor_id').references(() => profiles.id),
  action: text('action').notNull(),
  targetId: uuid('target_id'),
  details: jsonb('details').notNull().default({}),
  createdAt: createdAt(),
});
export const idempotency = pgTable(
  'idempotency',
  {
    actorId: uuid('actor_id')
      .notNull()
      .references(() => profiles.id),
    operation: text('operation').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    resultId: uuid('result_id').notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.operation, table.key] })],
);

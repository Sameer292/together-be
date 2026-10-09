import { and, eq, isNull } from 'drizzle-orm';
import type { Database, Transaction } from '../db';
import { challenges, participants, submissions } from '../db/schema';
import { fail } from '../errors';
import { activeMembership } from '../groups/repository';

export const participantAccess = async (tx: Database | Transaction, challengeId: string, actorId: string) => {
  const [challenge] = await tx
    .select({
      id: challenges.id,
      groupId: challenges.groupId,
      publishedAt: challenges.publishedAt,
      cancelledAt: challenges.cancelledAt,
      deadlineAt: challenges.deadlineAt,
      proofFormats: challenges.proofFormats,
    })
    .from(challenges)
    .where(eq(challenges.id, challengeId));
  if (!challenge?.publishedAt) return fail(404, 'not_found', 'Challenge not found');
  const membership = await activeMembership(tx, challenge.groupId, actorId);
  const [participant] = await tx
    .select({ membershipId: participants.membershipId })
    .from(participants)
    .where(and(eq(participants.challengeId, challengeId), eq(participants.userId, actorId)));
  if (!participant || participant.membershipId !== membership.id)
    return fail(403, 'forbidden', 'Not eligible for this challenge');
  return challenge;
};
export const revealAccess = async (tx: Database | Transaction, challengeId: string, actorId: string) => {
  const challenge = await participantAccess(tx, challengeId, actorId);
  const [own] = await tx
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(eq(submissions.challengeId, challengeId), eq(submissions.userId, actorId), isNull(submissions.deletedAt)),
    );
  if (!own) return fail(403, 'forbidden', 'Submit accepted proof to unlock the feed');
  return challenge;
};
export const submissionAccess = async (tx: Database | Transaction, submissionId: string, actorId: string) => {
  const [submission] = await tx
    .select({
      id: submissions.id,
      challengeId: submissions.challengeId,
      userId: submissions.userId,
      deletedAt: submissions.deletedAt,
    })
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (!submission || submission.deletedAt) return fail(404, 'not_found', 'Submission not found');
  if (submission.userId === actorId) await participantAccess(tx, submission.challengeId, actorId);
  else await revealAccess(tx, submission.challengeId, actorId);
  return submission;
};

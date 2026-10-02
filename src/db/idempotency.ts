import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { fail } from '../errors';
import type { Transaction } from './index';
import { idempotency } from './schema';

export const idempotent = async (
  tx: Transaction,
  actorId: string,
  operation: string,
  key: string,
  payload: unknown,
  create: () => Promise<string>,
): Promise<string> => {
  const requestHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actorId}:${operation}:${key}`}, 0))`);
  const existing = await tx.query.idempotency.findFirst({
    where: and(eq(idempotency.actorId, actorId), eq(idempotency.operation, operation), eq(idempotency.key, key)),
  });
  if (existing) {
    if (existing.requestHash !== requestHash)
      return fail(409, 'conflict', 'Idempotency key reused with another request');
    return existing.resultId;
  }
  const resultId = await create();
  await tx.insert(idempotency).values({ actorId, operation, key, requestHash, resultId });
  return resultId;
};

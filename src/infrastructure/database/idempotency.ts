import { createHash } from 'node:crypto';
import { fail } from '@shared/errors/app-error';
import { and, eq, sql } from 'drizzle-orm';
import type { Transaction } from './database.client';
import { idempotency } from './database.schema';

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

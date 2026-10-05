import { t } from 'elysia';

export const uuid = t.String({ format: 'uuid' });
export const idParams = t.Object({ id: uuid });
export const challengeParams = t.Object({ challengeId: uuid });
export const submissionParams = t.Object({ submissionId: uuid });
export const pagination = t.Object({
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
  cursor: t.Optional(uuid),
});

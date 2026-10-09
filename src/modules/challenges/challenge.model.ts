import { t } from 'elysia';

export const challengeInput = t.Object({
  title: t.String({ minLength: 1, maxLength: 160 }),
  description: t.String({ maxLength: 10000 }),
  criteria: t.String({ minLength: 1, maxLength: 10000 }),
  proofFormats: t.Array(t.Union([t.Literal('text'), t.Literal('image'), t.Literal('link')]), {
    minItems: 1,
    maxItems: 3,
    uniqueItems: true,
  }),
  deadlineAt: t.String({ format: 'date-time' }),
});

export type ChallengeBody = typeof challengeInput.static;

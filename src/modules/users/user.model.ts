import { t } from 'elysia';

export const updateProfileBody = t.Object({
  displayName: t.String({ minLength: 1, maxLength: 120 }),
  bio: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
});
export const deletionRequestBody = t.Object({ password: t.String({ minLength: 1 }) });

export type UpdateProfileBody = typeof updateProfileBody.static;

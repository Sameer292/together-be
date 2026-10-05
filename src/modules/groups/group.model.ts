import { uuid } from '@shared/models/request.model';
import { t } from 'elysia';

export const createGroupBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
});
export const updateGroupBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 120 }),
  description: t.String({ maxLength: 2000 }),
});
export const transferGroupBody = t.Object({ newOwnerId: uuid });
export const memberParams = t.Object({ id: uuid, userId: uuid });
export const invitationParams = t.Object({ id: uuid, inviteId: uuid });
export const createInvitationBody = t.Object({ expiresInHours: t.Integer({ minimum: 1, maximum: 168 }) });
export const acceptInvitationBody = t.Object({ token: t.String({ minLength: 32, maxLength: 128 }) });

export type CreateGroupBody = typeof createGroupBody.static;
export type UpdateGroupBody = typeof updateGroupBody.static;

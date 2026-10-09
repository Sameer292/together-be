import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { invitationParams } from '../../group.model';
import type { GroupService } from '../../group.service';

export const createRevokeInvitationRoute = (groups: GroupService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).delete(
    '/:id/invitations/:inviteId',
    async ({ actor, params }) => {
      await groups.revokeInvite(actor, params.id, params.inviteId);
      return message;
    },
    { params: invitationParams },
  );

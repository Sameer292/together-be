import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { memberParams } from '../../group.model';
import type { GroupService } from '../../group.service';

export const createRemoveMemberRoute = (groups: GroupService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).delete(
    '/:id/members/:userId',
    async ({ actor, params }) => {
      await groups.remove(actor, params.id, params.userId);
      return message;
    },
    { params: memberParams },
  );

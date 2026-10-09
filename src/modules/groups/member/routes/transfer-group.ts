import { idParams } from '@shared/models/request.model';
import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { transferGroupBody } from '../../group.model';
import type { GroupService } from '../../group.service';

export const createTransferGroupRoute = (groups: GroupService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).post(
    '/:id/transfer',
    async ({ actor, params, body }) => {
      await groups.transfer(actor, params.id, body.newOwnerId);
      return message;
    },
    { params: idParams, body: transferGroupBody },
  );

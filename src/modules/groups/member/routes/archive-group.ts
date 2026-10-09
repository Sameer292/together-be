import { idParams } from '@shared/models/request.model';
import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { GroupService } from '../../group.service';

export const createArchiveGroupRoute = (groups: GroupService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).post(
    '/:id/archive',
    async ({ actor, params }) => {
      await groups.archive(actor, params.id);
      return message;
    },
    { params: idParams },
  );

import { idParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { updateGroupBody } from '../../group.model';
import type { GroupService } from '../../group.service';

export const createUpdateGroupRoute = (groups: GroupService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .patch(
      '/:id',
      async ({ actor, params, body }) => ok(await groups.update(actor, params.id, body.name, body.description)),
      { params: idParams, body: updateGroupBody },
    );

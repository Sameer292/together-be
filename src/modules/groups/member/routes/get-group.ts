import { idParams } from '@shared/models/request.model';
import { groupResultDto } from '@shared/models/response.model';
import { documented, ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { GroupService } from '../../group.service';

export const createGetGroupRoute = (groups: GroupService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).get('/:id', async ({ actor, params }) => ok(await groups.get(actor, params.id)), {
    params: idParams,
    detail: documented(groupResultDto),
  });

import { pagination } from '@shared/models/request.model';
import { groupPageResultDto } from '@shared/models/response.model';
import { documented, ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { GroupService } from '../../group.service';

export const createGetGroupsRoute = (groups: GroupService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get('', async ({ actor, query }) => ok(await groups.list(actor, query.limit ?? 20, query.cursor)), {
      query: pagination,
      detail: documented(groupPageResultDto),
    });

import { pagination, submissionParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { EngagementService } from '../../engagement.service';

export const createGetCommentsRoute = (engagement: EngagementService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get(
      '/submissions/:submissionId/comments',
      async ({ actor, params, query }) =>
        ok(await engagement.listComments(actor, params.submissionId, query.limit ?? 20, query.cursor)),
      { params: submissionParams, query: pagination },
    );

import { submissionParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { EngagementService } from '../../engagement.service';

export const createGetReactionsRoute = (engagement: EngagementService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get(
      '/submissions/:submissionId/reactions',
      async ({ actor, params }) => ok(await engagement.listReactions(actor, params.submissionId)),
      { params: submissionParams },
    );

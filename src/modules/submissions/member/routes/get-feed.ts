import { challengeParams, pagination } from '@shared/models/request.model';
import { feedResultDto } from '@shared/models/response.model';
import { documented, ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { SubmissionService } from '../../submission.service';

export const createGetFeedRoute = (submissions: SubmissionService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get(
      '/feed',
      async ({ actor, params, query }) =>
        ok(await submissions.feed(actor, params.challengeId, query.limit ?? 20, query.cursor)),
      { params: challengeParams, query: pagination, detail: documented(feedResultDto) },
    );

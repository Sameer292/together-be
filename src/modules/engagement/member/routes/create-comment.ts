import { submissionParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { commentBody } from '../../engagement.model';
import type { EngagementService } from '../../engagement.service';

export const createCommentRoute = (engagement: EngagementService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .post(
      '/submissions/:submissionId/comments',
      async ({ actor, params, body }) => ok(await engagement.addComment(actor, params.submissionId, body.body)),
      { params: submissionParams, body: commentBody },
    );

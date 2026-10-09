import { submissionParams } from '@shared/models/request.model';
import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { reactionBody } from '../../engagement.model';
import type { EngagementService } from '../../engagement.service';

export const createReactionRoute = (engagement: EngagementService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).post(
    '/submissions/:submissionId/reactions',
    async ({ actor, params, body }) => {
      await engagement.addReaction(actor, params.submissionId, body.emoji);
      return message;
    },
    { params: submissionParams, body: reactionBody },
  );

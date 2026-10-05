import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { reactionParams } from '../../engagement.model';
import type { EngagementService } from '../../engagement.service';

export const createDeleteReactionRoute = (engagement: EngagementService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).delete(
    '/submissions/:submissionId/reactions/:emoji',
    async ({ actor, params }) => {
      await engagement.removeReaction(actor, params.submissionId, params.emoji);
      return message;
    },
    { params: reactionParams },
  );

import { idParams } from '@shared/models/request.model';
import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { EngagementService } from '../../engagement.service';

export const createDeleteCommentRoute = (engagement: EngagementService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).delete(
    '/comments/:id',
    async ({ actor, params }) => {
      await engagement.deleteComment(actor, params.id);
      return message;
    },
    { params: idParams },
  );

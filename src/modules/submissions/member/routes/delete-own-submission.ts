import { challengeParams } from '@shared/models/request.model';
import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { SubmissionService } from '../../submission.service';

export const createDeleteOwnSubmissionRoute = (submissions: SubmissionService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).delete(
    '/submissions/me',
    async ({ actor, params }) => {
      await submissions.deleteOwn(actor, params.challengeId);
      return message;
    },
    { params: challengeParams },
  );

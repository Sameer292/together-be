import { challengeParams } from '@shared/models/request.model';
import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { ChallengeService } from '../../challenge.service';

export const createCancelChallengeRoute = (challenges: ChallengeService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).post(
    '/:challengeId/cancel',
    async ({ actor, params }) => {
      await challenges.cancel(actor, params.challengeId);
      return message;
    },
    { params: challengeParams },
  );

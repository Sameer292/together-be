import { challengeParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { ChallengeService } from '../../challenge.service';

export const createPublishChallengeRoute = (challenges: ChallengeService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .post(
      '/:challengeId/publish',
      async ({ actor, params }) => ok(await challenges.publish(actor, params.challengeId)),
      { params: challengeParams },
    );

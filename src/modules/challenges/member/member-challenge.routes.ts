import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { ChallengeService } from '../challenge.service';
import { createCancelChallengeRoute } from './routes/cancel-challenge';
import { createGetChallengeRoute } from './routes/get-challenge';
import { createPublishChallengeRoute } from './routes/publish-challenge';
import { createUpdateChallengeRoute } from './routes/update-challenge';

export const createMemberChallengeRoutes = (challenges: ChallengeService, authGuard: AuthGuard) =>
  new Elysia({ prefix: '/challenges', tags: ['Challenges'] })
    .use(createGetChallengeRoute(challenges, authGuard))
    .use(createUpdateChallengeRoute(challenges, authGuard))
    .use(createPublishChallengeRoute(challenges, authGuard))
    .use(createCancelChallengeRoute(challenges, authGuard));

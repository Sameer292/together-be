import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { ChallengeService } from '../challenge.service';
import { createChallengeRoute } from './routes/create-challenge';
import { createGetChallengesRoute } from './routes/get-challenges';

export const createMemberGroupChallengeRoutes = (challenges: ChallengeService, authGuard: AuthGuard) =>
  new Elysia({ prefix: '/groups/:id/challenges', tags: ['Challenges'] })
    .use(createChallengeRoute(challenges, authGuard))
    .use(createGetChallengesRoute(challenges, authGuard));

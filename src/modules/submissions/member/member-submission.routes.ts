import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { RateLimit } from '@/app/middleware/rate-limit';
import type { SubmissionService } from '../submission.service';
import { createDeleteOwnSubmissionRoute } from './routes/delete-own-submission';
import { createGetFeedRoute } from './routes/get-feed';
import { createGetOwnSubmissionRoute } from './routes/get-own-submission';
import { createSubmitProofRoute } from './routes/submit-proof';

export const createMemberSubmissionRoutes = (
  submissions: SubmissionService,
  authGuard: AuthGuard,
  rateLimit: RateLimit,
) =>
  new Elysia({ prefix: '/challenges/:challengeId', tags: ['Submissions'] })
    .use(createSubmitProofRoute(submissions, authGuard, rateLimit))
    .use(createGetOwnSubmissionRoute(submissions, authGuard))
    .use(createDeleteOwnSubmissionRoute(submissions, authGuard))
    .use(createGetFeedRoute(submissions, authGuard));

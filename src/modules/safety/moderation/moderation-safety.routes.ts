import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { SafetyService } from '../safety.service';
import { createGetReportedProofRoute } from './routes/get-reported-proof';
import { createGetReportsRoute } from './routes/get-reports';
import { createReviewReportRoute } from './routes/review-report';

export const createModerationSafetyRoutes = (safety: SafetyService, authGuard: AuthGuard) =>
  new Elysia({ prefix: '/moderation', tags: ['Moderation'] })
    .use(createGetReportsRoute(safety, authGuard))
    .use(createReviewReportRoute(safety, authGuard))
    .use(createGetReportedProofRoute(safety, authGuard));

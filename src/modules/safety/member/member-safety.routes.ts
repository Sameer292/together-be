import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { SafetyService } from '../safety.service';
import { createBlockUserRoute } from './routes/block-user';
import { createReportSubmissionRoute } from './routes/report-submission';
import { createReportUserRoute } from './routes/report-user';
import { createUnblockUserRoute } from './routes/unblock-user';

export const createMemberSafetyRoutes = (safety: SafetyService, authGuard: AuthGuard) =>
  new Elysia({ tags: ['Safety'] })
    .use(createBlockUserRoute(safety, authGuard))
    .use(createUnblockUserRoute(safety, authGuard))
    .use(createReportUserRoute(safety, authGuard))
    .use(createReportSubmissionRoute(safety, authGuard));

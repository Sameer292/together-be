import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { reportsQuery } from '../../safety.model';
import type { SafetyService } from '../../safety.service';

export const createGetReportsRoute = (safety: SafetyService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get('/reports', async ({ actor, query }) => ok(await safety.listReports(actor, query.limit ?? 20)), {
      query: reportsQuery,
    });

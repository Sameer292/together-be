import { idParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { BillingService } from '../../billing.service';

export const createGetEntitlementRoute = (billing: BillingService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get('/groups/:id/entitlement', async ({ actor, params }) => ok(await billing.entitlement(actor, params.id)), {
      params: idParams,
    });

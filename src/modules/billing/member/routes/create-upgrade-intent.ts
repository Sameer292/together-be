import { idParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { BillingService } from '../../billing.service';

export const createUpgradeIntentRoute = (billing: BillingService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .post(
      '/groups/:id/upgrade-intents',
      async ({ actor, params }) => ok(await billing.createIntent(actor, params.id)),
      { params: idParams },
    );

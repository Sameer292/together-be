import { idParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { reconcileIntentBody } from '../../billing.model';
import type { BillingService } from '../../billing.service';

export const createReconcileUpgradeIntentRoute = (billing: BillingService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .post(
      '/upgrade-intents/:id/reconcile',
      async ({ actor, params, body }) => ok(await billing.reconcileIntent(actor, params.id, body.subscriptionId)),
      { params: idParams, body: reconcileIntentBody },
    );

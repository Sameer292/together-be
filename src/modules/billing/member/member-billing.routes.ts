import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { BillingService } from '../billing.service';
import { createUpgradeIntentRoute } from './routes/create-upgrade-intent';
import { createGetEntitlementRoute } from './routes/get-entitlement';
import { createReconcileUpgradeIntentRoute } from './routes/reconcile-upgrade-intent';

export const createMemberBillingRoutes = (billing: BillingService, authGuard: AuthGuard) =>
  new Elysia({ tags: ['Billing'] })
    .use(createGetEntitlementRoute(billing, authGuard))
    .use(createUpgradeIntentRoute(billing, authGuard))
    .use(createReconcileUpgradeIntentRoute(billing, authGuard));

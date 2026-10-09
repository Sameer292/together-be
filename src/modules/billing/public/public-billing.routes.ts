import { Elysia } from 'elysia';
import type { BillingService } from '../billing.service';
import { createWebhookRoute } from './routes/webhook';

export const createPublicBillingRoutes = (billing: BillingService) =>
  new Elysia({ prefix: '/billing', tags: ['Billing'] }).use(createWebhookRoute(billing));

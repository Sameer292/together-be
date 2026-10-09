import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { BillingService } from '../../billing.service';

export const createWebhookRoute = (billing: BillingService) =>
  new Elysia().post(
    '/webhook',
    async ({ request }) => {
      await billing.webhook(await request.text(), request.headers.get('x-revenuecat-webhook-signature'));
      return message;
    },
    { parse: 'none' },
  );

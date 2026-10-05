import { t } from 'elysia';

export const reconcileIntentBody = t.Object({ subscriptionId: t.String({ minLength: 1, maxLength: 500 }) });
export type ReconcileIntentBody = typeof reconcileIntentBody.static;

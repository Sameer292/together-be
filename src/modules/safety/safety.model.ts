import { uuid } from '@shared/models/request.model';
import { t } from 'elysia';

export const blockBody = t.Object({ userId: uuid });
export const reportBody = t.Object({ reason: t.String({ minLength: 1, maxLength: 2000 }) });
export const reportsQuery = t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })) });
export const reviewReportBody = t.Object({ state: t.Union([t.Literal('dismissed'), t.Literal('actioned')]) });

export type ReportBody = typeof reportBody.static;
export type ReviewReportBody = typeof reviewReportBody.static;

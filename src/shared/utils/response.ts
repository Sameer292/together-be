import { errorDto } from '@shared/models/response.model';
import type { TSchema } from 'elysia';

export const message = { data: { message: 'ok' } };
export const ok = <T>(value: T): { data: T } => ({ data: value });
export const documented = (schema: TSchema) => ({
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema } } },
    400: { description: 'Invalid request', content: { 'application/json': { schema: errorDto } } },
    401: { description: 'Unauthenticated', content: { 'application/json': { schema: errorDto } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: errorDto } } },
    409: { description: 'Conflict', content: { 'application/json': { schema: errorDto } } },
  },
});

import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { blockBody } from '../../safety.model';
import type { SafetyService } from '../../safety.service';

export const createBlockUserRoute = (safety: SafetyService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).post(
    '/blocks',
    async ({ actor, body }) => {
      await safety.block(actor, body.userId);
      return message;
    },
    { body: blockBody },
  );

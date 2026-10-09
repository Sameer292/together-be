import { idParams } from '@shared/models/request.model';
import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { SafetyService } from '../../safety.service';

export const createUnblockUserRoute = (safety: SafetyService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).delete(
    '/blocks/:id',
    async ({ actor, params }) => {
      await safety.unblock(actor, params.id);
      return message;
    },
    { params: idParams },
  );

import { idParams } from '@shared/models/request.model';
import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { MediaService } from '../../media.service';

export const createDeleteAttachmentRoute = (media: MediaService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).delete(
    '/:id',
    async ({ actor, params }) => {
      await media.removeAbandoned(actor, params.id);
      return message;
    },
    { params: idParams },
  );

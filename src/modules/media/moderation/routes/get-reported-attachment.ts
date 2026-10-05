import { idParams } from '@shared/models/request.model';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { MediaService } from '../../media.service';

export const createGetReportedAttachmentRoute = (media: MediaService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get('/:id', ({ actor, params }) => media.moderatedRead(actor, params.id), { params: idParams });

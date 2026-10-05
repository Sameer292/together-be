import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { RateLimit } from '@/app/middleware/rate-limit';
import type { MediaService } from '../media.service';
import { createDeleteAttachmentRoute } from './routes/delete-attachment';
import { createGetAttachmentRoute } from './routes/get-attachment';
import { createUploadProofRoute } from './routes/upload-proof';

export const createMemberMediaRoutes = (media: MediaService, authGuard: AuthGuard, rateLimit: RateLimit) =>
  new Elysia({ tags: ['Media'] })
    .use(createUploadProofRoute(media, authGuard, rateLimit))
    .use(
      new Elysia({ prefix: '/attachments' })
        .use(createGetAttachmentRoute(media, authGuard))
        .use(createDeleteAttachmentRoute(media, authGuard)),
    );

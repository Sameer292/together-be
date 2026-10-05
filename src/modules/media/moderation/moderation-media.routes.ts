import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { MediaService } from '../media.service';
import { createGetReportedAttachmentRoute } from './routes/get-reported-attachment';

export const createModerationMediaRoutes = (media: MediaService, authGuard: AuthGuard) =>
  new Elysia({ prefix: '/moderation/attachments', tags: ['Moderation'] }).use(
    createGetReportedAttachmentRoute(media, authGuard),
  );

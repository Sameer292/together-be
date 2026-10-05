import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { EngagementService } from '../engagement.service';
import { createCommentRoute } from './routes/create-comment';
import { createReactionRoute } from './routes/create-reaction';
import { createDeleteCommentRoute } from './routes/delete-comment';
import { createDeleteReactionRoute } from './routes/delete-reaction';
import { createGetCommentsRoute } from './routes/get-comments';
import { createGetReactionsRoute } from './routes/get-reactions';

export const createMemberEngagementRoutes = (engagement: EngagementService, authGuard: AuthGuard) =>
  new Elysia({ tags: ['Comments and Reactions'] })
    .use(createCommentRoute(engagement, authGuard))
    .use(createGetCommentsRoute(engagement, authGuard))
    .use(createDeleteCommentRoute(engagement, authGuard))
    .use(createReactionRoute(engagement, authGuard))
    .use(createDeleteReactionRoute(engagement, authGuard))
    .use(createGetReactionsRoute(engagement, authGuard));

import { createModerationMediaRoutes } from '@modules/media/moderation/moderation-media.routes';
import { createModerationSafetyRoutes } from '@modules/safety/moderation/moderation-safety.routes';
import { Elysia } from 'elysia';
import type { AppDependencies } from '../dependencies';

export const createModerationRoutes = ({ safety, media, authGuard }: AppDependencies) =>
  new Elysia().use(createModerationSafetyRoutes(safety, authGuard)).use(createModerationMediaRoutes(media, authGuard));

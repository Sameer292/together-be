import { Elysia } from 'elysia';
import type { AppDependencies } from '../dependencies';
import { createMemberRoutes } from './member-api.routes';
import { createModerationRoutes } from './moderation-api.routes';
import { createPublicRoutes } from './public-api.routes';

export const createRoutes = (dependencies: AppDependencies) =>
  new Elysia()
    .use(createPublicRoutes(dependencies))
    .use(createMemberRoutes(dependencies))
    .use(createModerationRoutes(dependencies));

import { createPublicAuthRoutes } from '@modules/auth/public/public-auth.routes';
import { createPublicBillingRoutes } from '@modules/billing/public/public-billing.routes';
import { Elysia } from 'elysia';
import type { AppDependencies } from '../dependencies';

export const createPublicRoutes = ({ auth, billing, rateLimit }: AppDependencies) =>
  new Elysia().use(createPublicAuthRoutes(auth, rateLimit)).use(createPublicBillingRoutes(billing));

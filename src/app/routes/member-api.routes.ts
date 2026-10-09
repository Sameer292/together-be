import { createMemberAuthRoutes } from '@modules/auth/member/member-auth.routes';
import { createMemberBillingRoutes } from '@modules/billing/member/member-billing.routes';
import { createMemberChallengeRoutes } from '@modules/challenges/member/member-challenge.routes';
import { createMemberGroupChallengeRoutes } from '@modules/challenges/member/member-group-challenge.routes';
import { createMemberEngagementRoutes } from '@modules/engagement/member/member-engagement.routes';
import { createMemberGroupRoutes } from '@modules/groups/member/member-group.routes';
import { createMemberInvitationRoutes } from '@modules/groups/member/member-invitation.routes';
import { createMemberMediaRoutes } from '@modules/media/member/member-media.routes';
import { createMemberSafetyRoutes } from '@modules/safety/member/member-safety.routes';
import { createMemberSubmissionRoutes } from '@modules/submissions/member/member-submission.routes';
import { createMemberUserRoutes } from '@modules/users/member/member-user.routes';
import { Elysia } from 'elysia';
import type { AppDependencies } from '../dependencies';

export const createMemberRoutes = ({
  auth,
  authGuard,
  rateLimit,
  users,
  groups,
  challenges,
  submissions,
  media,
  engagement,
  safety,
  billing,
}: AppDependencies) =>
  new Elysia()
    .use(createMemberAuthRoutes(auth, authGuard))
    .use(createMemberUserRoutes(users, auth, authGuard))
    .use(createMemberGroupRoutes(groups, authGuard, rateLimit))
    .use(createMemberInvitationRoutes(groups, authGuard, rateLimit))
    .use(createMemberGroupChallengeRoutes(challenges, authGuard))
    .use(createMemberChallengeRoutes(challenges, authGuard))
    .use(createMemberSubmissionRoutes(submissions, authGuard, rateLimit))
    .use(createMemberMediaRoutes(media, authGuard, rateLimit))
    .use(createMemberEngagementRoutes(engagement, authGuard))
    .use(createMemberSafetyRoutes(safety, authGuard))
    .use(createMemberBillingRoutes(billing, authGuard));

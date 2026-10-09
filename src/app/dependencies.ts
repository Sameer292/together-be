import type { Database } from '@infra/database/database.client';
import { createAuthService } from '@modules/auth/auth.service';
import { createBillingService } from '@modules/billing/billing.service';
import { createChallengeService } from '@modules/challenges/challenge.service';
import { createEngagementService } from '@modules/engagement/engagement.service';
import { createGroupService } from '@modules/groups/group.service';
import { createMediaService } from '@modules/media/media.service';
import { createSafetyService } from '@modules/safety/safety.service';
import { createSubmissionService } from '@modules/submissions/submission.service';
import { createUserService } from '@modules/users/user.service';
import type { Config } from './config/env';
import { createAuthGuard } from './middleware/auth-guard';
import { createRateLimit } from './middleware/rate-limit';

export const createDependencies = (config: Config, db: Database) => {
  const auth = createAuthService(config, db);
  return {
    auth,
    authGuard: createAuthGuard(auth),
    rateLimit: createRateLimit(),
    users: createUserService(db),
    groups: createGroupService(db, config),
    challenges: createChallengeService(db, config),
    submissions: createSubmissionService(db, config),
    media: createMediaService(db, config),
    engagement: createEngagementService(db),
    safety: createSafetyService(db),
    billing: createBillingService(db, config),
  };
};

export type AppDependencies = ReturnType<typeof createDependencies>;

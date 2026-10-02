export type Config = {
  databaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  storageBucket: string;
  authCallbackUrl: string;
  freeGroupCapacity: number;
  paidGroupCapacity: number;
  freeActiveChallenges: number;
  paidActiveChallenges: number;
  maxImageBytes: number;
  maxAttachmentsPerSubmission: number;
  billingMode: 'test' | 'revenuecat';
  revenueCatEnvironment: 'sandbox' | 'production';
  revenueCatWebhookSecret?: string;
  revenueCatApiKey?: string;
  revenueCatProjectId?: string;
  port: number;
};

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const positive = (name: string): number => {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};
export const loadConfig = (): Config => {
  const billingMode = required('BILLING_MODE');
  if (billingMode !== 'test' && billingMode !== 'revenuecat') throw new Error('Invalid BILLING_MODE');
  if (process.env.NODE_ENV === 'production' && billingMode === 'test')
    throw new Error('Test billing forbidden in production');
  const revenueCatEnvironment = process.env.REVENUECAT_ENVIRONMENT ?? 'sandbox';
  if (revenueCatEnvironment !== 'sandbox' && revenueCatEnvironment !== 'production')
    throw new Error('Invalid REVENUECAT_ENVIRONMENT');
  if (process.env.NODE_ENV === 'production' && revenueCatEnvironment !== 'production')
    throw new Error('Sandbox billing forbidden in production');
  const supabaseUrl = required('SUPABASE_URL');
  const authCallbackUrl = required('AUTH_CALLBACK_URL');
  for (const value of [supabaseUrl, authCallbackUrl]) {
    const parsed = new URL(value);
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
      throw new Error('HTTPS URLs required in production');
  }
  if (billingMode === 'revenuecat') {
    required('REVENUECAT_WEBHOOK_SECRET');
    required('REVENUECAT_API_KEY');
    required('REVENUECAT_PROJECT_ID');
  }
  const freeGroupCapacity = positive('FREE_GROUP_CAPACITY');
  const paidGroupCapacity = positive('PAID_GROUP_CAPACITY');
  const freeActiveChallenges = positive('FREE_ACTIVE_CHALLENGES');
  const paidActiveChallenges = positive('PAID_ACTIVE_CHALLENGES');
  if (paidGroupCapacity < freeGroupCapacity || paidActiveChallenges < freeActiveChallenges)
    throw new Error('Paid limits must not be lower than free limits');
  return {
    databaseUrl: required('DATABASE_URL'),
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    supabaseAnonKey: required('SUPABASE_ANON_KEY'),
    supabaseServiceKey: required('SUPABASE_SERVICE_KEY'),
    storageBucket: required('STORAGE_BUCKET'),
    authCallbackUrl,
    freeGroupCapacity,
    paidGroupCapacity,
    freeActiveChallenges,
    paidActiveChallenges,
    maxImageBytes: positive('MAX_IMAGE_BYTES'),
    maxAttachmentsPerSubmission: positive('MAX_ATTACHMENTS_PER_SUBMISSION'),
    billingMode,
    revenueCatEnvironment,
    revenueCatWebhookSecret: process.env.REVENUECAT_WEBHOOK_SECRET,
    revenueCatApiKey: process.env.REVENUECAT_API_KEY,
    revenueCatProjectId: process.env.REVENUECAT_PROJECT_ID,
    port: process.env.PORT ? positive('PORT') : 3000,
  };
};

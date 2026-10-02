# Local setup

Install Bun 1.4.2+ and Docker with Compose. From the repository root:

```sh
bun install --frozen-lockfile
docker compose -f compose.local.yml up -d --wait
cp .env.example .env
bun run db:migrate
bun run dev
```

In another terminal, run `bun run worker`. The Compose file starts PostgreSQL 16 on `127.0.0.1:54328`, creates `together_dev` and `together_test`, and grants a separate DML-only runtime role on newly migrated tables. Its passwords are local fixtures; never deploy them. `.env` is ignored by Git. `bun test` uses the isolated `together_test` URL from `.env`. `bun run db:seed` is optional; those synthetic profiles are not Auth logins.

Check `http://127.0.0.1:3000/v1/live`, `/v1/ready`, and `/v1/openapi`. In `PROVIDER_MODE=local`, call `POST /v1/auth/register` with JSON `{"email":"you@example.test","password":"a-long-local-password"}`. The response includes `data.devCode`; send it with the email to `POST /v1/auth/verify`. Local reset and resend responses also return `devCode`. This is development-only and startup rejects `PROVIDER_MODE=local` with `NODE_ENV=production`. Images are stored under `.local/media`, and both upload and retrieval still go through backend authorization.

## Use your Supabase project with local PostgreSQL

Keep both database URLs pointed at local PostgreSQL. Edit `.env`:

```dotenv
PROVIDER_MODE=supabase
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PROJECT_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_KEY=YOUR_PROJECT_SECRET_OR_SERVICE_ROLE_KEY
STORAGE_BUCKET=proof-private
```

The backend sends login, verification, refresh, and reset requests to Supabase Auth, verifies every bearer token through Auth, and stores the authenticated Supabase user UUID in local `profiles`. All groups, challenges, submissions, billing fixtures, and jobs remain in local PostgreSQL. The backend sends image bytes to your private Supabase Storage bucket and streams authorized reads back to callers. The app never connects to Supabase directly. A local Auth account is separate from a Supabase Auth account; register again after switching modes.

In the Supabase dashboard, enable email/password and email confirmation. Set confirmation and recovery [email templates](https://supabase.com/docs/guides/auth/auth-email-templates) to show `{{ .Token }}` so the user can enter the code in the app; allow the backend callback URL in Auth redirect settings. Create a **private** bucket named `proof-private` (or match `STORAGE_BUCKET`). [Disable the Data API](https://supabase.com/docs/guides/api/securing-your-api#disable-the-data-api) in the project's Data API integration overview. These are external dashboard actions and have not been performed here. Auth email sending and rate limits need project configuration; hosted Supabase's default SMTP may be unsuitable for broader testing. Get the current [publishable and secret API keys](https://supabase.com/docs/guides/getting-started/api-keys) in Settings → API Keys; this backend sends secret keys in `apikey`, not `Authorization`. Do not put project keys in a mobile bundle or commit `.env`.

`BILLING_MODE=test` uses deterministic upgrade fixtures; it does not charge a store account. For production, choose explicit policy limits, configure RevenueCat and store products, use a TLS PostgreSQL connection and least-privileged runtime role, and set `NODE_ENV=production`. See [deployment](deployment.md).

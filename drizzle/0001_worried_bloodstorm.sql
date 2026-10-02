CREATE TABLE "local_auth_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_auth_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "local_auth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_auth_codes_kind_valid" CHECK ("local_auth_codes"."kind" in ('email', 'recovery'))
);
--> statement-breakpoint
CREATE TABLE "local_auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"access_hash" text NOT NULL,
	"refresh_hash" text NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "local_auth_sessions_access_hash_unique" UNIQUE("access_hash"),
	CONSTRAINT "local_auth_sessions_refresh_hash_unique" UNIQUE("refresh_hash")
);
--> statement-breakpoint
ALTER TABLE "local_auth_accounts" ADD CONSTRAINT "local_auth_accounts_id_profiles_id_fk" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_auth_codes" ADD CONSTRAINT "local_auth_codes_account_id_local_auth_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."local_auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_auth_sessions" ADD CONSTRAINT "local_auth_sessions_account_id_local_auth_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."local_auth_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_auth_codes_account_idx" ON "local_auth_codes" USING btree ("account_id","kind","created_at");
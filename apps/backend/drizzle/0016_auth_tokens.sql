-- Account recovery & email verification support. Additive and idempotent.
-- `email_verified_at` records when a user confirmed their login email (null =
-- unverified). `auth_tokens` holds single-use, expiring, hashed tokens for the
-- password-reset and email-verification flows.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;
--> statement-breakpoint
-- Grandfather in accounts that pre-date verification: they were created without
-- the check, so treat them as verified (dated to their sign-up) rather than
-- retroactively locking them out. Only touches rows added before this column.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_hash_idx" ON "auth_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_tokens_user_purpose_idx" ON "auth_tokens" ("user_id","purpose");

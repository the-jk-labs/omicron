-- Migrate authentication to Better Auth. Transforms the users table, backfills
-- credential accounts from the existing bcrypt hashes (no password resets), and
-- replaces the hand-rolled sessions/auth_tokens tables. Everyone signs in once
-- after upgrade (old sessions are dropped).

-- users: new Better Auth columns + drop NOT NULL on the legacy hash.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint

-- Backfill the new columns from existing data before the old one is dropped.
UPDATE "users" SET "email_verified" = ("email_verified_at" IS NOT NULL) WHERE "email_verified" = false;--> statement-breakpoint
UPDATE "users" SET "display_username" = "username" WHERE "display_username" IS NULL;--> statement-breakpoint
UPDATE "users" SET "updated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "email_verified_at";--> statement-breakpoint

-- accounts: one credential row per user, carrying the bcrypt hash over.
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accounts_issuer_account_idx" ON "accounts" ("issuer","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_idx" ON "accounts" ("user_id");--> statement-breakpoint
INSERT INTO "accounts" ("user_id", "account_id", "provider_id", "issuer", "password", "created_at", "updated_at")
	SELECT "id", "id"::text, 'credential', 'local:credential', "password_hash", "created_at", now()
	FROM "users" WHERE "password_hash" IS NOT NULL
	ON CONFLICT ("issuer","account_id") DO NOTHING;--> statement-breakpoint

-- verifications: Better Auth's out-of-band token store.
CREATE TABLE IF NOT EXISTS "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications" ("identifier");--> statement-breakpoint

-- sessions: replace the hand-rolled table (id = SHA-256 of token) with Better
-- Auth's shape. Dropping it signs everyone out once.
DROP TABLE IF EXISTS "sessions";--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_idx" ON "sessions" ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" ("user_id");--> statement-breakpoint

-- auth_tokens is superseded by verifications.
DROP TABLE IF EXISTS "auth_tokens";

-- Per-user publishing tokens for the content webhook. Additive and idempotent.
--
-- Each row is one credential a writer minted for one external system ("Sanity",
-- "my publish script"). Only the SHA-256 of the token is stored, so a database
-- leak cannot be replayed against the endpoint and the plaintext exists exactly
-- once — in the response to the mint request. `revoked_at` retires a token
-- without deleting the row, keeping `last_used_at` legible after the fact.
--
-- Before this, ingestion ran on a single instance-wide WEBHOOK_SECRET, so only
-- one account on the whole instance could publish over the webhook. That secret
-- still works as an operator-level fallback.
CREATE TABLE IF NOT EXISTS "webhook_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_tokens" ADD CONSTRAINT "webhook_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_tokens_hash_idx" ON "webhook_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_tokens_user_created_idx" ON "webhook_tokens" ("user_id","created_at");
--> statement-breakpoint
-- Scope a post's external key to its author. It was instance-wide in 0024,
-- which was correct while a single configured account owned every ingested
-- post. Now that any writer can mint a token, two of them would collide on an
-- ordinary slug like "hello-world" — the second publisher would be told the key
-- belongs to someone else's post. Per-author uniqueness keeps re-sends
-- idempotent for each writer without letting them tread on each other.
DROP INDEX IF EXISTS "posts_external_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "posts_author_external_idx" ON "posts" ("author_id","external_id");

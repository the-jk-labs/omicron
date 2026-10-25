CREATE TABLE "oauth_refresh_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"grant_id" uuid NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "oauth_apps" ADD COLUMN "scopes" text DEFAULT 'read:accounts' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_apps" ADD COLUMN "public_client" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD COLUMN "scopes" text DEFAULT 'read:accounts' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_requests" ADD COLUMN "scopes" text DEFAULT 'read:accounts' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD COLUMN "scopes" text DEFAULT 'read:accounts' NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD COLUMN "refresh_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_refresh_tokens" ADD CONSTRAINT "oauth_refresh_tokens_grant_id_oauth_tokens_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_refresh_tokens_grant_idx" ON "oauth_refresh_tokens" USING btree ("grant_id");
-- Admin user deletion with a retention window. Additive and idempotent.
-- `users.deleted_at` marks a soft-deleted account (null = live): the account
-- cannot sign in, vanishes from every listing, profile and feed, and its row
-- (posts, follows and all) is kept for the retention window so an admin can
-- restore it (see services/moderation.ts DELETED_USER_RETENTION_DAYS).
-- `users.deleted_by` records which moderator deleted it (null when unknown or
-- when that moderator is gone). A sweeper hard-deletes rows past the window
-- (see services/deletedUsers.ts).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_by" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_deleted_at_idx" ON "users" ("deleted_at");

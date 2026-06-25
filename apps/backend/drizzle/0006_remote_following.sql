ALTER TABLE "follows" ADD COLUMN IF NOT EXISTS "remote_followee_id" uuid REFERENCES "remote_actors"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "follows_remote_followee_unique_idx" ON "follows" ("follower_id","remote_followee_id") WHERE "follower_id" is not null and "remote_followee_id" is not null;

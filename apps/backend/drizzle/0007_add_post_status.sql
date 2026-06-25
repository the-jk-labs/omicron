ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'published';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_author_status_created_idx" ON "posts" ("author_id","status","created_at" DESC);

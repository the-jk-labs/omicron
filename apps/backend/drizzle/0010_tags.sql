-- Topical hashtags. `tags` holds each distinct tag (slug = normalized key,
-- name = display form); `post_tags` is the post↔tag join; `tag_follows` lets a
-- user follow a tag so its posts surface in their personalized feed. Tags
-- federate as ActivityPub Hashtag objects on a post's `tag` property.
CREATE TABLE IF NOT EXISTS "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "post_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tag_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tag_follows" ADD CONSTRAINT "tag_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tag_follows" ADD CONSTRAINT "tag_follows_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tags_slug_idx" ON "tags" ("slug");
--> statement-breakpoint
-- Trigram index backs tag search (ILIKE '%term%'), which a btree cannot use.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tags_slug_trgm_idx" ON "tags" USING gin ("slug" gin_trgm_ops);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "post_tags_unique_idx" ON "post_tags" ("post_id","tag_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_tags_tag_idx" ON "post_tags" ("tag_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_tags_post_idx" ON "post_tags" ("post_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tag_follows_unique_idx" ON "tag_follows" ("user_id","tag_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tag_follows_user_idx" ON "tag_follows" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tag_follows_tag_idx" ON "tag_follows" ("tag_id");

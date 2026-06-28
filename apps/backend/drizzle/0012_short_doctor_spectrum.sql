-- Reading lists: user-curated collections of posts, like YouTube playlists.
-- `reading_lists` holds each list (public/private, with one special per-user
-- "Read later" list flagged by `is_read_later`); `reading_list_items` is the
-- list↔post join. Both reuse the existing `posts` table.
CREATE TABLE IF NOT EXISTS "reading_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"is_read_later" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_lists" ADD CONSTRAINT "reading_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_list_items" ADD CONSTRAINT "reading_list_items_list_id_reading_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "reading_lists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_list_items" ADD CONSTRAINT "reading_list_items_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_lists_user_created_idx" ON "reading_lists" ("user_id","created_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reading_lists_read_later_idx" ON "reading_lists" ("user_id") WHERE "is_read_later";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reading_list_items_unique_idx" ON "reading_list_items" ("list_id","post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_list_items_list_created_idx" ON "reading_list_items" ("list_id","created_at" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_list_items_post_idx" ON "reading_list_items" ("post_id");

-- Profile tags: topic hashtags a user features on their profile (like
-- Mastodon's featured hashtags). `user_tags` is the local-user↔tag join;
-- `remote_actor_tags` mirrors tags parsed from cached remote actors' Person
-- `tag` Hashtags so federated profiles display their tags too. Both reuse the
-- existing `tags` table.
CREATE TABLE IF NOT EXISTS "user_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "remote_actor_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remote_actor_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_tags" ADD CONSTRAINT "user_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_tags" ADD CONSTRAINT "user_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "remote_actor_tags" ADD CONSTRAINT "remote_actor_tags_remote_actor_id_remote_actors_id_fk" FOREIGN KEY ("remote_actor_id") REFERENCES "remote_actors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "remote_actor_tags" ADD CONSTRAINT "remote_actor_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_tags_unique_idx" ON "user_tags" ("user_id","tag_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_tags_user_idx" ON "user_tags" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "remote_actor_tags_unique_idx" ON "remote_actor_tags" ("remote_actor_id","tag_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "remote_actor_tags_actor_idx" ON "remote_actor_tags" ("remote_actor_id");

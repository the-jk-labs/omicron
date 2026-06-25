CREATE TABLE IF NOT EXISTS "remote_actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ap_id" text NOT NULL,
	"handle" text NOT NULL,
	"username" text NOT NULL,
	"host" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"inbox_url" text,
	"shared_inbox_url" text,
	"outbox_url" text,
	"followers_count" integer,
	"following_count" integer,
	"fetched_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "remote_actors_ap_id_idx" ON "remote_actors" ("ap_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "remote_actors_handle_idx" ON "remote_actors" ("handle");
--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "author_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "remote_actor_id" uuid REFERENCES "remote_actors"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT IF EXISTS "posts_author_xor_remote";
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_xor_remote" CHECK (("author_id" IS NOT NULL) <> ("remote_actor_id" IS NOT NULL));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_remote_actor_created_idx" ON "posts" ("remote_actor_id","created_at");

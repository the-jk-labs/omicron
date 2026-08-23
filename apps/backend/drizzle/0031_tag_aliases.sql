-- Tag aliases: canonicalization for fragmented / misspelled tags.
-- A row maps alias_slug -> target tag id. On write the slug is resolved to
-- the target's slug before insertion, so post_tags only stores canonical tags.
-- The alias itself remains in the table for future writes and for redirecting
-- tag pages (GET /tags/:slug resolves the alias).
CREATE TABLE IF NOT EXISTS "tag_aliases" (
	"alias_slug" text PRIMARY KEY NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tag_aliases" ADD CONSTRAINT "tag_aliases_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tag_aliases_tag_idx" ON "tag_aliases" ("tag_id");

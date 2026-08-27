-- Upload records: who owns each persisted media file, and how big it is.
-- Additive and idempotent.
--
-- Every accepted upload (post images, avatars, the instance banner) writes a
-- UUID-named file to UPLOADS_DIR. Before this table nothing recorded its owner
-- or size, so storage use was unattributable and nothing could later decide
-- which files are unreferenced and safe to delete. Each row mirrors one file
-- (`filename` is the name on disk, uniquely indexed as the lookup key); row
-- deletion never deletes the file, and a deleted user's rows cascade while
-- their files stay behind for delayed garbage collection, since federated
-- copies may still reference the URLs.
CREATE TABLE IF NOT EXISTS "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uploads_filename_idx" ON "uploads" ("filename");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "uploads_owner_created_idx" ON "uploads" ("owner_id","created_at" DESC);
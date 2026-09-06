-- Federated replies ("Responses" from Mastodon and friends). Lets a comment be
-- authored by either a local user (`author_id`) or a cached remote actor
-- (`remote_actor_id`) whose Note reply arrived over federation — the same
-- local-or-remote shape `follows`/`notifications`/`recommendations` use.
--
-- `author_id` drops NOT NULL (existing rows all keep theirs); the new CHECK
-- keeps it exactly-one-kind per row. `ap_id` is the comment's ActivityPub URI:
-- the canonical Note id for an inbound remote reply (dedupe + Update/Delete
-- routing), minted lazily for a local comment on first outbound federation.
ALTER TABLE "comments" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "remote_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "ap_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_remote_actor_id_remote_actors_id_fk" FOREIGN KEY ("remote_actor_id") REFERENCES "remote_actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comments_ap_id_idx" ON "comments" ("ap_id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_kind_ck" CHECK (("author_id" is null) <> ("remote_actor_id" is null));

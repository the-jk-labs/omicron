-- Recommendations ("repost", federates as ActivityPub Announce). Additive.
--
-- One row per (post, recommender) — a recommender announcing a post to their
-- followers. The recommender is either a local user or a cached remote actor,
-- the same local-or-remote shape `follows`/`notifications` already use. Two
-- partial unique indexes (one per recommender kind) make recommending
-- idempotent, mirroring how `likes` uses a single one.
--
-- Deliberately absent from the Local/Global timelines: those list posts by
-- their own publish time and never join this table. A recommendation only
-- ever surfaces on the recommender's followers' "For you" feed and on the
-- recommender's profile "Recommendations" tab (see
-- db/repositories/recommendations.ts).
CREATE TABLE IF NOT EXISTS "recommendations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "remote_actor_id" uuid REFERENCES "remote_actors"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recommendations_post_user_idx"
  ON "recommendations" ("post_id", "user_id") WHERE "user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recommendations_post_remote_actor_idx"
  ON "recommendations" ("post_id", "remote_actor_id") WHERE "remote_actor_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recommendations_post_idx" ON "recommendations" ("post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recommendations_user_created_idx"
  ON "recommendations" ("user_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recommendations_remote_actor_created_idx"
  ON "recommendations" ("remote_actor_id", "created_at" DESC, "id" DESC);

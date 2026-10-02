-- One inbound follow edge per (followee, remote actor). Idempotent.
-- A remote server that resends Follow with a new activity id (after a lost
-- Accept) used to add a second edge. Keep one per pair (an approved edge first,
-- then the oldest), drop the rest, then enforce it.
DELETE FROM "follows" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "followee_id", "remote_actor" ORDER BY "approved" DESC, "created_at", "id"
    ) AS "n"
    FROM "follows"
    WHERE "remote_actor" IS NOT NULL
  ) AS "ranked"
  WHERE "n" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "follows_remote_follower_unique_idx" ON "follows" ("followee_id","remote_actor") WHERE "remote_actor" is not null;

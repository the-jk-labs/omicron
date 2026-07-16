-- Private / public accounts (Instagram-style). Additive and idempotent.
-- `users.is_private`: public by default; when true, posts are visible only to
-- approved followers and following requires approval (see follows.approved).
-- `follows.follow_activity_id`: for an inbound *remote* follow request, the
-- original Follow activity URI, kept so a later approve can send a correct
-- Accept(Follow) referencing it. Null for local edges / auto-accepted follows.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "follows" ADD COLUMN IF NOT EXISTS "follow_activity_id" text;

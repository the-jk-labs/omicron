-- Machine-ingested posts (the /api/webhooks/content endpoint). Additive and
-- idempotent.
--
-- `external_id` is the caller's stable key for a piece of content (a Sanity
-- document id, a CMS slug, …). It is what makes ingestion idempotent: a second
-- webhook carrying the same key updates the post it created the first time
-- instead of publishing a duplicate. Null for every human-authored post, and
-- unique across the instance — Postgres treats NULLs as distinct in a unique
-- index, so the constraint only ever binds ingested rows.
--
-- `summary` is a short plain-text preview (the CMS `description`, or one
-- derived from the body). It federates as the Article's `summary`, which is
-- what Mastodon and friends show above a long-form link.
--
-- `cover_url` is an absolute http(s) URL to the post's banner image, hosted
-- wherever the CMS puts it. It federates as the Article's `image`.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "external_id" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "summary" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "cover_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "posts_external_id_idx" ON "posts" ("external_id");

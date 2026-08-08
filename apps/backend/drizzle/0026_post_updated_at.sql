-- When a post's own content last changed. Additive and idempotent.
--
-- `posts.updated_at` is what the XML sitemap publishes as `<lastmod>`, which is
-- how a search engine decides an article is worth re-reading. Without it every
-- post reported its publish date forever: an author could rewrite a piece and
-- the stale version would sit in search results until a crawler happened back
-- on its own schedule.
--
-- Added nullable, backfilled from `created_at`, then constrained — rather than
-- added with a `now()` default in one step, which would stamp every existing
-- post with the migration's own timestamp and tell every engine that the
-- instance's entire archive changed the moment it was upgraded. An untouched
-- post must keep reporting the truth.
--
-- Each statement is individually idempotent, so a re-run is a no-op: the column
-- is only added when missing, the backfill only touches rows still null (so a
-- post edited after the migration is never dragged back to its creation date),
-- and SET DEFAULT / SET NOT NULL restate what is already true.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz;--> statement-breakpoint
UPDATE "posts" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "updated_at" SET NOT NULL;

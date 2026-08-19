-- Scheduled publishing. Additive.
--
-- `posts.status` gains a third value, `scheduled`: written, waiting for its
-- moment. Modelling it as a status rather than as a published post with a
-- future date is what makes this safe — every listing that can reach another
-- user's post already filters on `status = 'published'` (the shared
-- `isPublished` predicate, or a literal equality in the sitemap, dashboard and
-- related-posts queries), so a third value is invisible to all of them without
-- one of those queries changing.
--
-- No enum: `status` is a plain text column and the application owns the set of
-- values, exactly as it did when `draft` was introduced.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "publish_at" timestamptz;
--> statement-breakpoint
-- `publish_at` is set if and only if the post is waiting to go out. In the
-- database rather than only in the service because both failure modes are
-- silent: a scheduled post with no due time is never claimed by the sweeper and
-- simply never publishes, and a published post that still claims to be due
-- would be re-federated on the next tick. Every existing row is `draft` or
-- `published` with a NULL `publish_at`, so this holds on add.
ALTER TABLE "posts" ADD CONSTRAINT "posts_publish_at_status_ck"
  CHECK (("status" = 'scheduled') = ("publish_at" IS NOT NULL));
--> statement-breakpoint
-- The sweeper's only query (`status = 'scheduled' and publish_at <= now()`),
-- run every 30 seconds forever. Partial, so it holds one entry per pending post
-- rather than one per post on the instance.
CREATE INDEX IF NOT EXISTS "posts_due_idx"
  ON "posts" ("publish_at") WHERE "status" = 'scheduled';
--> statement-breakpoint
-- The author's Scheduled tab, soonest first — the opposite order to drafts,
-- which read newest-edited first.
CREATE INDEX IF NOT EXISTS "posts_author_due_idx"
  ON "posts" ("author_id", "publish_at") WHERE "status" = 'scheduled';

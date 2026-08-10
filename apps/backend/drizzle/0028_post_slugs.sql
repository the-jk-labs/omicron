-- Readable, id-free post URLs. Additive and idempotent.
--
-- A permalink used to be `/@author/<title-slug>-<8 hex of the uuid>`. The id was
-- there because nothing guaranteed the slug alone identified a post; the cost
-- was a random token in every shared link. `posts.slug` makes the slug itself
-- the key — unique per author — so the id can go.
--
-- Backfilled at boot rather than here (see services/postSlugs.ts): the slug is
-- produced by the same TypeScript that the editor and the sitemap use, and
-- reimplementing its transliteration in PL/pgSQL would give two answers that
-- drift. Rows stay NULL until then, which reads as "no slug yet" and serves the
-- old id-suffixed URL — the same thing an untitled draft does.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "posts_author_slug_idx" ON "posts" ("author_id", "slug");
--> statement-breakpoint
-- Slugs a post has been moved off, kept so links shared before a retitle still
-- resolve. Unique per author for the same reason the live slug is: a retired
-- address must never be reassigned to different writing.
CREATE TABLE IF NOT EXISTS "post_slug_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL REFERENCES "posts"("id") ON DELETE CASCADE,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "post_slug_history_author_slug_idx"
  ON "post_slug_history" ("author_id", "slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_slug_history_post_idx" ON "post_slug_history" ("post_id");

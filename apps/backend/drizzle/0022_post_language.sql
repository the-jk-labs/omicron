-- Per-post language. Additive and idempotent. `posts.language` holds the BCP-47
-- primary language subtag the author wrote the post in (e.g. "en", "tr"),
-- lowercased, or null when unspecified. Powers the reader's per-language feed
-- filter and federates as the Article content's language tag.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "language" text;

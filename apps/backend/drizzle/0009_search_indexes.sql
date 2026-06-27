-- Precomputed full-text search document for posts: title (weight A) + body with
-- HTML tags stripped (weight B). STORED so it is computed once on write, then a
-- GIN index makes search an index lookup instead of a per-row tsvector recompute.
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
	GENERATED ALWAYS AS (
		setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
		setweight(to_tsvector('english', regexp_replace("content_html", '<[^>]+>', ' ', 'g')), 'B')
	) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_search_idx" ON "posts" USING gin ("search_vector");
--> statement-breakpoint
-- Trigram indexes back people search (ILIKE '%term%'), which a btree cannot use
-- because of the leading wildcard.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_username_trgm_idx" ON "users" USING gin ("username" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_display_name_trgm_idx" ON "users" USING gin ("display_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "remote_actors_handle_trgm_idx" ON "remote_actors" USING gin ("handle" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "remote_actors_display_name_trgm_idx" ON "remote_actors" USING gin ("display_name" gin_trgm_ops);

-- Permanent, pseudonymous view de-duplication (see ANALYTICS.md).
-- Dedup is no longer scoped to a single day: a view now counts once per
-- (post, reader) forever, keyed by a one-way hash of either the reader's
-- user id (signed in) or a random first-party cookie value (anonymous) --
-- never an IP address, user-agent, or day-scoped salt. Old daily dedup rows
-- carry no meaning under the new permanent semantics, so the table is
-- recreated empty rather than migrated in place.
DROP TABLE "post_view_seen";--> statement-breakpoint
CREATE TABLE "post_view_seen" (
	"post_id" uuid NOT NULL,
	"visitor_key" text NOT NULL,
	CONSTRAINT "post_view_seen_post_id_visitor_key_pk" PRIMARY KEY("post_id","visitor_key")
);
--> statement-breakpoint
ALTER TABLE "post_view_seen" ADD CONSTRAINT "post_view_seen_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;

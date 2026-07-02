-- Instance-level defederation. Additive and idempotent.
-- `blocked_domains` lists hostnames this instance refuses to federate with:
-- inbound activities from a blocked host are dropped, outbound delivery skips
-- them, and browse-time fetches are refused. A block matches the exact host and
-- any subdomain (blocking example.com also blocks mastodon.example.com).
CREATE TABLE IF NOT EXISTS "blocked_domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

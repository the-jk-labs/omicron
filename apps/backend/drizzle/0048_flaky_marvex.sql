CREATE TABLE "blocked_remote_actors" (
	"ap_id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federated_instances" (
	"domain" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"auto_cache" boolean DEFAULT true NOT NULL,
	"software" text,
	"software_version" text,
	"node_name" text,
	"user_count" integer,
	"active_month" integer,
	"local_posts" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"actors_synced" integer DEFAULT 0 NOT NULL,
	"posts_synced" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "federated_instances_source_ck" CHECK ("federated_instances"."source" in ('fedidb', 'manual')),
	CONSTRAINT "federated_instances_status_ck" CHECK ("federated_instances"."status" in ('pending', 'ok', 'unsupported', 'error'))
);
--> statement-breakpoint
ALTER TABLE "blocked_domains" ADD COLUMN "severity" text DEFAULT 'suspend' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_remote_actors_handle_idx" ON "blocked_remote_actors" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "federated_instances_due_idx" ON "federated_instances" USING btree ("next_sync_at") WHERE "federated_instances"."auto_cache";--> statement-breakpoint
ALTER TABLE "blocked_domains" ADD CONSTRAINT "blocked_domains_severity_ck" CHECK ("blocked_domains"."severity" in ('suspend', 'limit'));
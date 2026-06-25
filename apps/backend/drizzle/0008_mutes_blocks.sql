CREATE TABLE IF NOT EXISTS "mutes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_user_id" uuid,
	"target_remote_actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_user_id" uuid,
	"target_remote_actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mutes" ADD CONSTRAINT "mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mutes" ADD CONSTRAINT "mutes_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mutes" ADD CONSTRAINT "mutes_target_remote_actor_id_remote_actors_id_fk" FOREIGN KEY ("target_remote_actor_id") REFERENCES "remote_actors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blocks" ADD CONSTRAINT "blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blocks" ADD CONSTRAINT "blocks_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blocks" ADD CONSTRAINT "blocks_target_remote_actor_id_remote_actors_id_fk" FOREIGN KEY ("target_remote_actor_id") REFERENCES "remote_actors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mutes_local_unique_idx" ON "mutes" ("user_id","target_user_id") WHERE "target_user_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mutes_remote_unique_idx" ON "mutes" ("user_id","target_remote_actor_id") WHERE "target_remote_actor_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mutes_user_idx" ON "mutes" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blocks_local_unique_idx" ON "blocks" ("user_id","target_user_id") WHERE "target_user_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blocks_remote_unique_idx" ON "blocks" ("user_id","target_remote_actor_id") WHERE "target_remote_actor_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blocks_user_idx" ON "blocks" ("user_id");

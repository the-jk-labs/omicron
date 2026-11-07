-- Applications predate accounts owning them, so none can have an owner. Their grants, codes and requests cascade.
DELETE FROM "oauth_apps";--> statement-breakpoint
ALTER TABLE "oauth_apps" ADD COLUMN "owner_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_apps" ADD CONSTRAINT "oauth_apps_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

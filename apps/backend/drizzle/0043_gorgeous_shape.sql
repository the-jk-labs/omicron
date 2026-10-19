CREATE TABLE "oauth_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"secret_hash" text NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"website" text,
	"authorized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_requests" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"redirect_uri" text NOT NULL,
	"state" text,
	"code_challenge" text,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"code_hash" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "oauth_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "oauth_tokens_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_client_id_oauth_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_requests" ADD CONSTRAINT "oauth_requests_client_id_oauth_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_requests" ADD CONSTRAINT "oauth_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_requests" ADD CONSTRAINT "oauth_requests_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_client_id_oauth_apps_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_codes_expiry_idx" ON "oauth_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_requests_expiry_idx" ON "oauth_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_tokens_user_idx" ON "oauth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_expiry_idx" ON "oauth_tokens" USING btree ("expires_at");
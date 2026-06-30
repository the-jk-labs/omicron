CREATE TABLE "instance_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_view_seen" (
	"day" date NOT NULL,
	"post_id" uuid NOT NULL,
	"visitor_hash" text NOT NULL,
	CONSTRAINT "post_view_seen_day_post_id_visitor_hash_pk" PRIMARY KEY("day","post_id","visitor_hash")
);
--> statement-breakpoint
CREATE TABLE "post_views" (
	"post_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "post_views_post_id_day_pk" PRIMARY KEY("post_id","day")
);
--> statement-breakpoint
ALTER TABLE "post_view_seen" ADD CONSTRAINT "post_view_seen_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_views_post_idx" ON "post_views" USING btree ("post_id");

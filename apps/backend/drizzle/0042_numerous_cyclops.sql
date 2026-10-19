ALTER TABLE "posts" ADD COLUMN "ai_assisted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_ai_assisted_posts" boolean DEFAULT true NOT NULL;
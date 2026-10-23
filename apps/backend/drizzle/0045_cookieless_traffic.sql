ALTER TABLE "traffic_buckets" DROP CONSTRAINT "traffic_sketch_ck";--> statement-breakpoint
ALTER TABLE "traffic_buckets" DROP COLUMN "visitors";--> statement-breakpoint
ALTER TABLE "traffic_buckets" DROP COLUMN "visits";
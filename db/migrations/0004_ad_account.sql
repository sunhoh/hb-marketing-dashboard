ALTER TABLE "ad_metrics" DROP CONSTRAINT "ad_metrics_key";--> statement-breakpoint
ALTER TABLE "ad_metrics" ADD COLUMN "account" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_metrics" ADD CONSTRAINT "ad_metrics_key" UNIQUE("date","granularity","client","channel","segment","creative_id","account");
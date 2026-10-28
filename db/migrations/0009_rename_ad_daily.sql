ALTER TABLE "ad_daily" RENAME TO "ad_metrics";--> statement-breakpoint
ALTER TABLE "ad_metrics" DROP CONSTRAINT "ad_daily_key";--> statement-breakpoint
ALTER TABLE "ad_metrics" DROP CONSTRAINT "ad_daily_creative_id_creatives_id_fk";
--> statement-breakpoint
DROP INDEX "ad_daily_client_date";--> statement-breakpoint
ALTER TABLE "ad_metrics" ADD CONSTRAINT "ad_metrics_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_metrics_client_date" ON "ad_metrics" USING btree ("client","date");--> statement-breakpoint
ALTER TABLE "ad_metrics" ADD CONSTRAINT "ad_metrics_key" UNIQUE NULLS NOT DISTINCT("date","channel","account_id","campaign_id","adgroup_id","creative_id","country");--> statement-breakpoint
ALTER SEQUENCE "ad_daily_id_seq" RENAME TO "ad_metrics_id_seq";
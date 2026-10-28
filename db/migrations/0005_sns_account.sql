ALTER TABLE "sns_snapshots" DROP CONSTRAINT "sns_snapshots_key";--> statement-breakpoint
ALTER TABLE "sns_stats" DROP CONSTRAINT "sns_stats_key";--> statement-breakpoint
ALTER TABLE "sns_stats" ALTER COLUMN "followers" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sns_snapshots" ADD COLUMN "account" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sns_stats" ADD COLUMN "account" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sns_snapshots" ADD CONSTRAINT "sns_snapshots_key" UNIQUE("date","client","platform","account");--> statement-breakpoint
ALTER TABLE "sns_stats" ADD CONSTRAINT "sns_stats_key" UNIQUE("week_start","client","platform","account");
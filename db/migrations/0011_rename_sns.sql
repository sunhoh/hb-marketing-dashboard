ALTER TABLE "sns_snapshots" RENAME TO "sns_daily";--> statement-breakpoint
ALTER TABLE "sns_stats" RENAME TO "sns_weekly";--> statement-breakpoint
ALTER TABLE "sns_daily" DROP CONSTRAINT "sns_snapshots_key";--> statement-breakpoint
ALTER TABLE "sns_weekly" DROP CONSTRAINT "sns_stats_key";--> statement-breakpoint
ALTER TABLE "sns_daily" ADD CONSTRAINT "sns_daily_key" UNIQUE("date","client","platform","account");--> statement-breakpoint
ALTER TABLE "sns_weekly" ADD CONSTRAINT "sns_weekly_key" UNIQUE("week_start","client","platform","account");--> statement-breakpoint
ALTER SEQUENCE "sns_snapshots_id_seq" RENAME TO "sns_daily_id_seq";--> statement-breakpoint
ALTER SEQUENCE "sns_stats_id_seq" RENAME TO "sns_weekly_id_seq";--> statement-breakpoint
ALTER INDEX "sns_snapshots_pkey" RENAME TO "sns_daily_pkey";--> statement-breakpoint
ALTER INDEX "sns_stats_pkey" RENAME TO "sns_weekly_pkey";

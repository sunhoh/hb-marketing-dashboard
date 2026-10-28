CREATE TYPE "public"."sns_platform" AS ENUM('instagram', 'youtube', 'tiktok');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'success', 'error');--> statement-breakpoint
ALTER TABLE "youtube_video_snapshots" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "youtube_video_snapshots" CASCADE;--> statement-breakpoint
ALTER TABLE "ga4_daily" ALTER COLUMN "client" SET DATA TYPE "public"."client" USING "client"::"public"."client";--> statement-breakpoint
ALTER TABLE "gsc_daily" ALTER COLUMN "client" SET DATA TYPE "public"."client" USING "client"::"public"."client";--> statement-breakpoint
ALTER TABLE "gsc_query_daily" ALTER COLUMN "client" SET DATA TYPE "public"."client" USING "client"::"public"."client";--> statement-breakpoint
ALTER TABLE "sns_daily" ALTER COLUMN "client" SET DATA TYPE "public"."client" USING "client"::"public"."client";--> statement-breakpoint
ALTER TABLE "sns_daily" ALTER COLUMN "platform" SET DATA TYPE "public"."sns_platform" USING "platform"::"public"."sns_platform";--> statement-breakpoint
ALTER TABLE "sns_daily" ALTER COLUMN "source" SET DATA TYPE "public"."source" USING "source"::"public"."source";--> statement-breakpoint
ALTER TABLE "sns_weekly" ALTER COLUMN "client" SET DATA TYPE "public"."client" USING "client"::"public"."client";--> statement-breakpoint
ALTER TABLE "sns_weekly" ALTER COLUMN "platform" SET DATA TYPE "public"."sns_platform" USING "platform"::"public"."sns_platform";--> statement-breakpoint
ALTER TABLE "sns_weekly" ALTER COLUMN "source" SET DATA TYPE "public"."source" USING "source"::"public"."source";--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "source" SET DATA TYPE "public"."source" USING "source"::"public"."source";--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "status" SET DATA TYPE "public"."sync_status" USING "status"::"public"."sync_status";--> statement-breakpoint
ALTER TABLE "sync_runs" ALTER COLUMN "status" SET DEFAULT 'running'::"public"."sync_status";--> statement-breakpoint
ALTER TABLE "youtube_videos" ALTER COLUMN "client" SET DATA TYPE "public"."client" USING "client"::"public"."client";--> statement-breakpoint
ALTER TABLE "youtube_videos" ALTER COLUMN "is_short" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "youtube_videos" ALTER COLUMN "is_short" SET DATA TYPE boolean USING "is_short"::boolean;--> statement-breakpoint
ALTER TABLE "youtube_videos" ALTER COLUMN "is_short" SET DEFAULT false;
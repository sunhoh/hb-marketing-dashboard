-- 소재 정보는 새 동기화가 다시 채운다(형식 값이 한글 → enum 으로, 캠페인 열이 NOT NULL 로 바뀌어서 기존 행은 옮길 수 없다)
DELETE FROM "creatives";--> statement-breakpoint
CREATE TYPE "public"."ad_channel" AS ENUM('naver-search', 'naver-brand', 'naver-place', 'meta', 'gangnam-unni');--> statement-breakpoint
CREATE TYPE "public"."client" AS ENUM('gu-gangnam', 'gu-ilsan', 'luho');--> statement-breakpoint
CREATE TYPE "public"."country" AS ENUM('KR', 'JP', 'CN', 'TW', 'HK', 'MO', 'SG', 'MY', 'ID', 'TH', 'VN', 'PH', 'US', 'CA', 'GB', 'AU', 'OTHER', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."creative_format" AS ENUM('image', 'video', 'carousel');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('naver_api', 'meta_api', 'instagram_api', 'youtube_api', 'ga4_api', 'gsc_api', 'sheet');--> statement-breakpoint
CREATE TABLE "ad_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"client" "client" NOT NULL,
	"channel" "ad_channel" NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_name" text NOT NULL,
	"adgroup_id" text,
	"adgroup_name" text,
	"creative_id" text,
	"country" "country",
	"spend" bigint NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"conversions" integer,
	"source" "source" NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_daily_key" UNIQUE NULLS NOT DISTINCT("date","channel","account_id","campaign_id","adgroup_id","creative_id","country")
);
--> statement-breakpoint
ALTER TABLE "creatives" ALTER COLUMN "client" SET DATA TYPE "public"."client" USING "client"::"public"."client";--> statement-breakpoint
ALTER TABLE "creatives" ALTER COLUMN "channel" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "creatives" ALTER COLUMN "channel" SET DATA TYPE "public"."ad_channel" USING "channel"::"public"."ad_channel";--> statement-breakpoint
ALTER TABLE "creatives" ALTER COLUMN "format" SET DATA TYPE "public"."creative_format" USING "format"::"public"."creative_format";--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "account_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "campaign_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "campaign_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "creatives" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_daily" ADD CONSTRAINT "ad_daily_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_daily_client_date" ON "ad_daily" USING btree ("client","date");--> statement-breakpoint
ALTER TABLE "creatives" DROP COLUMN "synced_at";
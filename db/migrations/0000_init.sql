CREATE TABLE "ad_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"granularity" text NOT NULL,
	"client" text NOT NULL,
	"channel" text NOT NULL,
	"segment" text DEFAULT '' NOT NULL,
	"creative_id" text DEFAULT '' NOT NULL,
	"spend" bigint NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"conversions" integer,
	"source" text NOT NULL,
	"memo" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_metrics_key" UNIQUE("date","granularity","client","channel","segment","creative_id"),
	CONSTRAINT "ad_metrics_granularity" CHECK ("ad_metrics"."granularity" in ('day', 'week'))
);
--> statement-breakpoint
CREATE TABLE "creatives" (
	"id" text PRIMARY KEY NOT NULL,
	"client" text NOT NULL,
	"channel" text DEFAULT 'meta' NOT NULL,
	"name" text NOT NULL,
	"format" text,
	"status" text,
	"thumbnail_url" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_ranks" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"client" text NOT NULL,
	"keyword" text NOT NULL,
	"rank" integer,
	"source" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_ranks_key" UNIQUE("week_start","client","keyword")
);
--> statement-breakpoint
CREATE TABLE "place_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"client" text NOT NULL,
	"reviews" integer NOT NULL,
	"rating" numeric(3, 2),
	"saves" integer,
	"source" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_stats_key" UNIQUE("week_start","client")
);
--> statement-breakpoint
CREATE TABLE "sns_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_start" date NOT NULL,
	"client" text NOT NULL,
	"platform" text NOT NULL,
	"followers" integer NOT NULL,
	"views" integer,
	"source" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sns_stats_key" UNIQUE("week_start","client","platform")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"rows_upserted" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "viral_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"published_on" date NOT NULL,
	"client" text NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"keyword" text,
	"top_exposed" integer DEFAULT 0 NOT NULL,
	"checked_on" date,
	"source" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "viral_posts_url" UNIQUE("url")
);

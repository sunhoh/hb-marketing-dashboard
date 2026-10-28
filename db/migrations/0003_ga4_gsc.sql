CREATE TABLE "ga4_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"client" text NOT NULL,
	"source_medium" text NOT NULL,
	"sessions" integer NOT NULL,
	"new_users" integer NOT NULL,
	"conversions" integer NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ga4_daily_key" UNIQUE("date","client","source_medium")
);
--> statement-breakpoint
CREATE TABLE "gsc_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"client" text NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"position_sum" numeric NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gsc_daily_key" UNIQUE("date","client")
);
--> statement-breakpoint
CREATE TABLE "gsc_query_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"client" text NOT NULL,
	"query" text NOT NULL,
	"clicks" integer NOT NULL,
	"impressions" integer NOT NULL,
	"position_sum" numeric NOT NULL,
	CONSTRAINT "gsc_query_daily_key" UNIQUE("date","client","query")
);

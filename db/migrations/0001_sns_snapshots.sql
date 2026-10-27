CREATE TABLE "sns_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"client" text NOT NULL,
	"platform" text NOT NULL,
	"followers" integer NOT NULL,
	"total_views" bigint NOT NULL,
	"source" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sns_snapshots_key" UNIQUE("date","client","platform")
);

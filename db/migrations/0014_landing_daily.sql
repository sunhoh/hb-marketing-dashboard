CREATE TABLE "landing_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"client" "client" NOT NULL,
	"property" text NOT NULL,
	"campaign" text NOT NULL,
	"content" text NOT NULL,
	"source_medium" text NOT NULL,
	"sessions" integer NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landing_daily_key" UNIQUE("date","property","campaign","content","source_medium")
);

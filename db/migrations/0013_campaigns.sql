CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" "ad_channel" NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean NOT NULL,
	"status" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

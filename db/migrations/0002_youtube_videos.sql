CREATE TABLE "youtube_video_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"video_id" text NOT NULL,
	"views" bigint NOT NULL,
	CONSTRAINT "youtube_video_snapshots_key" UNIQUE("date","video_id")
);
--> statement-breakpoint
CREATE TABLE "youtube_videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"client" text NOT NULL,
	"video_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"duration_sec" integer NOT NULL,
	"is_short" integer DEFAULT 0 NOT NULL,
	"thumbnail_url" text,
	"views" bigint NOT NULL,
	"likes" integer,
	"comments" integer,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_videos_key" UNIQUE("client","video_id")
);

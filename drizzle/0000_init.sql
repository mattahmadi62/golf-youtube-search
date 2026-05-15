CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"yt_channel_id" text NOT NULL,
	"handle" text,
	"name" text NOT NULL,
	"subscriber_ct" integer,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"slug" text NOT NULL,
	"country" text,
	"state" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"osm_id" bigint,
	"is_curated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"candidate_name" text NOT NULL,
	"evidence" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_course_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_courses" (
	"video_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"confidence" numeric(3, 2),
	"source" text NOT NULL,
	"evidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_courses_video_id_course_id_pk" PRIMARY KEY("video_id","course_id")
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"yt_video_id" text NOT NULL,
	"channel_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"published_at" timestamp with time zone NOT NULL,
	"duration_s" integer,
	"thumbnail_url" text,
	"view_count" bigint,
	"captions_text" text,
	"extracted_at" timestamp with time zone,
	"extraction_model" text
);
--> statement-breakpoint
ALTER TABLE "extraction_review_queue" ADD CONSTRAINT "extraction_review_queue_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_review_queue" ADD CONSTRAINT "extraction_review_queue_resolved_course_id_courses_id_fk" FOREIGN KEY ("resolved_course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_courses" ADD CONSTRAINT "video_courses_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_courses" ADD CONSTRAINT "video_courses_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channels_yt_channel_id_unique" ON "channels" USING btree ("yt_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_slug_unique" ON "courses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "courses_name_idx" ON "courses" USING btree ("name");--> statement-breakpoint
CREATE INDEX "courses_curated_idx" ON "courses" USING btree ("is_curated");--> statement-breakpoint
CREATE INDEX "review_queue_status_idx" ON "extraction_review_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "review_queue_video_id_idx" ON "extraction_review_queue" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "video_courses_course_id_idx" ON "video_courses" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "videos_yt_video_id_unique" ON "videos" USING btree ("yt_video_id");--> statement-breakpoint
CREATE INDEX "videos_channel_id_idx" ON "videos" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "videos_published_at_idx" ON "videos" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "videos_extracted_at_idx" ON "videos" USING btree ("extracted_at");
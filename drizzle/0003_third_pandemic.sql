CREATE TABLE "course_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"course_id" uuid NOT NULL,
	"confirmation_token" text NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_subscriptions" ADD CONSTRAINT "course_subscriptions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_subscriptions_email_course_unique" ON "course_subscriptions" USING btree ("email","course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_subscriptions_confirmation_token_unique" ON "course_subscriptions" USING btree ("confirmation_token");--> statement-breakpoint
CREATE UNIQUE INDEX "course_subscriptions_unsubscribe_token_unique" ON "course_subscriptions" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE INDEX "course_subscriptions_email_idx" ON "course_subscriptions" USING btree ("email");--> statement-breakpoint
CREATE INDEX "course_subscriptions_course_id_idx" ON "course_subscriptions" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_subscriptions_confirmed_idx" ON "course_subscriptions" USING btree ("confirmed_at");
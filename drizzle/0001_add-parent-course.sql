ALTER TABLE "courses" ADD COLUMN "parent_course_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_parent_course_id_courses_id_fk" FOREIGN KEY ("parent_course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "courses_parent_idx" ON "courses" USING btree ("parent_course_id");
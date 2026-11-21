CREATE TYPE "public"."session_change_kind" AS ENUM('cancel', 'reschedule', 'extra');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('lecture', 'tutorial', 'lab');--> statement-breakpoint
CREATE TABLE "class_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"kind" "session_kind" NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_session_time_chk" CHECK ("class_session"."end_time" > "class_session"."start_time" and "class_session"."weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "session_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"class_session_id" uuid,
	"kind" "session_change_kind" NOT NULL,
	"session_kind" "session_kind",
	"original_date" date,
	"new_date" date,
	"new_start_time" time,
	"new_end_time" time,
	"new_location" text,
	"source" "item_source" DEFAULT 'manual' NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"field_set_at" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_change" ADD CONSTRAINT "session_change_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_change" ADD CONSTRAINT "session_change_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_change" ADD CONSTRAINT "session_change_class_session_id_class_session_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "class_session_course_idx" ON "class_session" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_change_one_active" ON "session_change" USING btree ("class_session_id","original_date") WHERE "session_change"."deleted_at" is null and "session_change"."kind" in ('cancel', 'reschedule');--> statement-breakpoint
CREATE INDEX "session_change_course_idx" ON "session_change" USING btree ("course_id");
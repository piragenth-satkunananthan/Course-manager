CREATE TYPE "public"."unknown_course_status" AS ENUM('open', 'added', 'mapped', 'ignored');--> statement-breakpoint
CREATE TABLE "unknown_course_mention" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"first_message_id" uuid,
	"pending_ops" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "unknown_course_status" DEFAULT 'open' NOT NULL,
	"course_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "inbox_message" ADD COLUMN "possibly_missed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "unknown_course_mention" ADD CONSTRAINT "unknown_course_mention_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unknown_course_mention" ADD CONSTRAINT "unknown_course_mention_first_message_id_inbox_message_id_fk" FOREIGN KEY ("first_message_id") REFERENCES "public"."inbox_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unknown_course_mention" ADD CONSTRAINT "unknown_course_mention_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unknown_course_mention_unique" ON "unknown_course_mention" USING btree ("student_id","name_key");--> statement-breakpoint
-- Messages flagged before this column existed: their arrival time stands in.
UPDATE "inbox_message" SET "possibly_missed_at" = "received_at" WHERE "possibly_missed" AND "possibly_missed_at" IS NULL;

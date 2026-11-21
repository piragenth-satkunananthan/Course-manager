CREATE TYPE "public"."inbox_decision" AS ENUM('ignored', 'question', 'applied', 'unknown_course', 'possibly_missed', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."inbox_kind" AS ENUM('text', 'edit', 'revoke', 'other');--> statement-breakpoint
CREATE TYPE "public"."inbox_status" AS ENUM('pending', 'processing', 'done');--> statement-breakpoint
CREATE TYPE "public"."wa_status" AS ENUM('unlinked', 'pairing', 'connected', 'logged_out', 'error');--> statement-breakpoint
CREATE TABLE "inbox_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"wa_group_id" uuid NOT NULL,
	"semester_id" uuid,
	"wa_message_id" text NOT NULL,
	"kind" "inbox_kind" NOT NULL,
	"edit_of" uuid,
	"sender_name" text,
	"sent_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"text_enc" "bytea",
	"revoked_at" timestamp with time zone,
	"possibly_missed" boolean DEFAULT false NOT NULL,
	"status" "inbox_status" DEFAULT 'pending' NOT NULL,
	"processing_started_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"batch_id" uuid,
	"decision" "inbox_decision",
	"decision_reason" text
);
--> statement-breakpoint
CREATE TABLE "wa_auth_key" (
	"student_id" text NOT NULL,
	"key_type" text NOT NULL,
	"key_id" text NOT NULL,
	"value_enc" "bytea" NOT NULL,
	CONSTRAINT "wa_auth_key_student_id_key_type_key_id_pk" PRIMARY KEY("student_id","key_type","key_id")
);
--> statement-breakpoint
CREATE TABLE "wa_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"wa_jid" text NOT NULL,
	"subject" text NOT NULL,
	"linked_course_id" uuid,
	"linked_semester_id" uuid,
	"linked_at" timestamp with time zone,
	CONSTRAINT "wa_group_one_link_chk" CHECK ("wa_group"."linked_course_id" is null or "wa_group"."linked_semester_id" is null)
);
--> statement-breakpoint
CREATE TABLE "wa_session" (
	"student_id" text PRIMARY KEY NOT NULL,
	"creds_enc" "bytea",
	"status" "wa_status" DEFAULT 'unlinked' NOT NULL,
	"pairing_phone" text,
	"pairing_code" text,
	"pairing_requested_at" timestamp with time zone,
	"unlink_requested_at" timestamp with time zone,
	"groups_reload_requested_at" timestamp with time zone,
	"last_connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"last_event_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "inbox_message" ADD CONSTRAINT "inbox_message_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_message" ADD CONSTRAINT "inbox_message_wa_group_id_wa_group_id_fk" FOREIGN KEY ("wa_group_id") REFERENCES "public"."wa_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_message" ADD CONSTRAINT "inbox_message_semester_id_semester_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semester"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_message" ADD CONSTRAINT "inbox_message_edit_of_inbox_message_id_fk" FOREIGN KEY ("edit_of") REFERENCES "public"."inbox_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_auth_key" ADD CONSTRAINT "wa_auth_key_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_group" ADD CONSTRAINT "wa_group_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_group" ADD CONSTRAINT "wa_group_linked_course_id_course_id_fk" FOREIGN KEY ("linked_course_id") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_group" ADD CONSTRAINT "wa_group_linked_semester_id_semester_id_fk" FOREIGN KEY ("linked_semester_id") REFERENCES "public"."semester"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_session" ADD CONSTRAINT "wa_session_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_message_unique" ON "inbox_message" USING btree ("student_id","wa_group_id","wa_message_id");--> statement-breakpoint
CREATE INDEX "inbox_message_pending_idx" ON "inbox_message" USING btree ("status","wa_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_group_jid_unique" ON "wa_group" USING btree ("student_id","wa_jid");
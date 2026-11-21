CREATE TYPE "public"."email_kind" AS ENUM('digest', 'final_reminder', 'alert', 'password_reset', 'account_deleted');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('sending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."health_component" AS ENUM('wa_socket', 'ai', 'scheduler', 'email', 'backup');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"kind" "email_kind" NOT NULL,
	"digest_date" date,
	"entity_type" "entity_type",
	"entity_id" uuid,
	"due_at" timestamp with time zone,
	"subject" text NOT NULL,
	"status" "email_status" NOT NULL,
	"provider_message_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"attempted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_signal" (
	"component" "health_component" PRIMARY KEY NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"detail" text
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_log_one_digest_per_day" ON "email_log" USING btree ("student_id","digest_date") WHERE "email_log"."kind" = 'digest';--> statement-breakpoint
CREATE UNIQUE INDEX "email_log_one_final_reminder" ON "email_log" USING btree ("entity_type","entity_id","due_at") WHERE "email_log"."kind" = 'final_reminder';
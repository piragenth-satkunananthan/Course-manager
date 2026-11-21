CREATE TYPE "public"."batch_status" AS ENUM('running', 'applied', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."change_risk" AS ENUM('normal', 'moved_later', 'cancelled');--> statement-breakpoint
CREATE TABLE "ai_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"wa_group_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"model_id" text,
	"prompt_version" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"status" "batch_status" DEFAULT 'running' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "auto_change" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" "version_op" NOT NULL,
	"after_version" integer NOT NULL,
	"summary" text NOT NULL,
	"risk" "change_risk" DEFAULT 'normal' NOT NULL,
	"undone_at" timestamp with time zone,
	"model_id" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_change_source" (
	"auto_change_id" uuid NOT NULL,
	"inbox_message_id" uuid NOT NULL,
	CONSTRAINT "auto_change_source_auto_change_id_inbox_message_id_pk" PRIMARY KEY("auto_change_id","inbox_message_id")
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"title_key" text NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_batch" ADD CONSTRAINT "ai_batch_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_batch" ADD CONSTRAINT "ai_batch_wa_group_id_wa_group_id_fk" FOREIGN KEY ("wa_group_id") REFERENCES "public"."wa_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_change" ADD CONSTRAINT "auto_change_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_change" ADD CONSTRAINT "auto_change_batch_id_ai_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ai_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_change_source" ADD CONSTRAINT "auto_change_source_auto_change_id_auto_change_id_fk" FOREIGN KEY ("auto_change_id") REFERENCES "public"."auto_change"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_change_source" ADD CONSTRAINT "auto_change_source_inbox_message_id_inbox_message_id_fk" FOREIGN KEY ("inbox_message_id") REFERENCES "public"."inbox_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression" ADD CONSTRAINT "suppression_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppression" ADD CONSTRAINT "suppression_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_change_student_idx" ON "auto_change" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "auto_change_entity_idx" ON "auto_change" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "suppression_course_idx" ON "suppression" USING btree ("course_id");
CREATE TYPE "public"."actor" AS ENUM('ai', 'student', 'system');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('todo', 'in_progress', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('assignment', 'exam', 'session_change', 'semester');--> statement-breakpoint
CREATE TYPE "public"."item_source" AS ENUM('manual', 'ai');--> statement-breakpoint
CREATE TYPE "public"."version_op" AS ENUM('create', 'update', 'delete', 'undo', 'status');--> statement-breakpoint
CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" date NOT NULL,
	"due_time" time,
	"status" "assignment_status" DEFAULT 'todo' NOT NULL,
	"submitted_at" timestamp with time zone,
	"submit_where" text,
	"is_group_work" boolean DEFAULT false NOT NULL,
	"source" "item_source" DEFAULT 'manual' NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"field_set_at" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"op" "version_op" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"before_field_set_at" jsonb,
	"actor" "actor" NOT NULL,
	"auto_change_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind_label" text,
	"date" date,
	"start_time" time,
	"location" text,
	"topics" text,
	"source" "item_source" DEFAULT 'manual' NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"field_set_at" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_version" ADD CONSTRAINT "entity_version_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam" ADD CONSTRAINT "exam_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam" ADD CONSTRAINT "exam_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_student_due_idx" ON "assignment" USING btree ("student_id","due_date");--> statement-breakpoint
CREATE INDEX "entity_version_entity_idx" ON "entity_version" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "exam_student_date_idx" ON "exam" USING btree ("student_id","date");
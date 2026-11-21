CREATE TYPE "public"."course_colour" AS ENUM('blue', 'violet', 'pink', 'orange', 'cyan', 'olive', 'slate');--> statement-breakpoint
CREATE TYPE "public"."nickname_source" AS ENUM('manual', 'unknown_course');--> statement-breakpoint
CREATE TABLE "course" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"semester_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"lecturer_name" text,
	"colour" "course_colour" NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_nickname" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"source" "nickname_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "semester" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"field_set_at" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "semester_dates_chk" CHECK ("semester"."end_date" >= "semester"."start_date")
);
--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_semester_id_semester_id_fk" FOREIGN KEY ("semester_id") REFERENCES "public"."semester"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_nickname" ADD CONSTRAINT "course_nickname_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_nickname" ADD CONSTRAINT "course_nickname_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semester" ADD CONSTRAINT "semester_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_code_unique" ON "course" USING btree ("student_id","semester_id",lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "course_nickname_unique" ON "course_nickname" USING btree ("student_id","course_id","nickname");--> statement-breakpoint
CREATE UNIQUE INDEX "semester_one_current" ON "semester" USING btree ("student_id") WHERE "semester"."is_current";
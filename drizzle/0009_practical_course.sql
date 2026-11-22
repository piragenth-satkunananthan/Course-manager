ALTER TABLE "course" ADD COLUMN "practical_of_course_id" uuid;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_practical_of_course_id_course_id_fk" FOREIGN KEY ("practical_of_course_id") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_practical_unique" ON "course" USING btree ("practical_of_course_id");--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_practical_not_self_chk" CHECK ("course"."practical_of_course_id" <> "course"."id");
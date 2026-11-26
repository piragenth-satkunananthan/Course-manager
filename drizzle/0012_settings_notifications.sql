ALTER TABLE "user" ADD COLUMN "digest_on" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "digest_time" text DEFAULT '07:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "digest_days" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "reminder_hours" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "second_reminder_hours" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "quiet_start" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "quiet_end" text;--> statement-breakpoint
CREATE UNIQUE INDEX "email_log_one_reminder_per_kind" ON "email_log" USING btree ("kind","entity_type","entity_id","due_at") WHERE "email_log"."due_at" is not null;
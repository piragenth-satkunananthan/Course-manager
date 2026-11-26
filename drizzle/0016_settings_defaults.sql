ALTER TABLE "user" ADD COLUMN "default_due_time" text DEFAULT '23:59' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "week_start" text DEFAULT 'monday' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "time_format" text DEFAULT '24h' NOT NULL;
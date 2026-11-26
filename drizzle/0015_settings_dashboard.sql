ALTER TABLE "user" ADD COLUMN "due_soon_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "dashboard_layout" jsonb;
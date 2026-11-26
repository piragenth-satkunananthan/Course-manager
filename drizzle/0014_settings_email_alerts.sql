ALTER TYPE "public"."email_kind" ADD VALUE 'email_confirm';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_email" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_email_pending" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_email_token_hash" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "notify_email_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "alerts_off" text[] DEFAULT '{}'::text[] NOT NULL;
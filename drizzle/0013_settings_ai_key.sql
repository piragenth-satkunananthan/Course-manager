ALTER TABLE "user" ADD COLUMN "nim_api_key_enc" "bytea";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "nim_model" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "nim_model_previous" text;
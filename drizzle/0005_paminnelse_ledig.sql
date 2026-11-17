ALTER TABLE "cabin" ADD COLUMN "remind_when_idle" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cabin" ADD COLUMN "idle_reminder_sent_at" timestamp with time zone;
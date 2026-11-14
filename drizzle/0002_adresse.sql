ALTER TABLE "cabin" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cabin" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "cabin" ADD COLUMN "longitude" double precision;